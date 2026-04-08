const InventoryPage = {
  items: [],
  grouped: {},
  rewards: [],
  selectedIds: new Set(),
  activeTab: null,
  activeSection: 'items', // items | rewards

  async load() {
    try {
      const [itemData, rewards] = await Promise.all([
        API.get('/items'),
        API.get('/rewards'),
      ]);
      this.items = itemData.items;
      this.grouped = itemData.grouped;
      this.rewards = rewards;
      if (!this.activeTab && Object.keys(this.grouped).length > 0) {
        this.activeTab = Object.keys(this.grouped)[0];
      }
      this.selectedIds.clear();
      this.render();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  render() {
    const container = document.getElementById('page-inventory');
    const e = API.escapeHtml.bind(API);

    container.innerHTML = `
      <div class="page-header">背包</div>
      <div class="card" style="display:flex;gap:8px">
        <button class="btn btn-small ${this.activeSection === 'items' ? 'btn-primary' : 'btn-secondary'}"
          onclick="InventoryPage.switchSection('items')">道具</button>
        <button class="btn btn-small ${this.activeSection === 'rewards' ? 'btn-primary' : 'btn-secondary'}"
          onclick="InventoryPage.switchSection('rewards')">奖励</button>
      </div>
      <div id="inventory-content"></div>
    `;

    const content = document.getElementById('inventory-content');
    if (this.activeSection === 'rewards') {
      content.innerHTML = this.renderRewards(e);
    } else {
      content.innerHTML = this.renderItems(e);
    }
  },

  renderRewards(e) {
    const pending = this.rewards.filter(r => r.status === 'completed');
    const redeemed = this.rewards.filter(r => r.status === 'redeemed');

    return `
      <div class="card">
        <div class="card-title">待兑现奖励</div>
        ${pending.length === 0 ? '<div class="empty-state">暂无待兑现奖励</div>' : ''}
        ${pending.map(r => `
          <div class="item-row">
            <div class="item-info">
              <div class="item-name">${e(r.name)}</div>
              <div class="item-meta">${e(r.type)} · 难度${r.difficulty}/10 · 发起人${e(r.creator_name)}</div>
              <div class="item-meta">🎁 ${e(r.reward_description)}</div>
            </div>
            <button class="btn btn-success btn-small" onclick="InventoryPage.redeem(${r.id})">兑现</button>
          </div>
        `).join('')}
      </div>

      <div class="card">
        <div class="card-title">已兑现</div>
        ${redeemed.length === 0 ? '<div class="empty-state">暂无已兑现记录</div>' : ''}
        ${redeemed.map(r => `
          <div class="item-row">
            <div class="item-info">
              <div class="item-name">${e(r.name)}</div>
              <div class="item-meta">🎁 ${e(r.reward_description)}</div>
            </div>
            <span style="font-size:12px;color:var(--green)">已兑现</span>
          </div>
        `).join('')}
      </div>
    `;
  },

  renderItems(e) {
    const tabs = Object.keys(this.grouped);

    if (this.items.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">🎒</div>
          <div>背包空空如也</div>
          <div style="font-size:13px;margin-top:8px">完成行为上报可获得道具</div>
        </div>
      `;
    }

    const selectedTotal = this.getSelectedTempValue();
    const permanentGain = Math.floor(selectedTotal / 10);

    return `
      <div class="card">
        <div class="card-title">道具背包 <span style="font-size:13px;color:var(--text-dim)">共${this.items.length}件</span></div>
        <div style="display:flex;gap:8px;margin-bottom:12px;overflow-x:auto;flex-wrap:nowrap">
          ${tabs.map((t, idx) => `
            <button class="btn btn-small ${this.activeTab === t ? 'btn-primary' : 'btn-secondary'}"
              onclick="InventoryPage.switchTabByIndex(${idx})" style="white-space:nowrap">
              ${e(this.grouped[t].name)}(${this.grouped[t].items.length})
            </button>
          `).join('')}
        </div>

        ${this.activeTab && this.grouped[this.activeTab] ? `
          <div class="card" style="padding:12px;background:var(--bg-card-light)">
            <div class="card-title" style="margin-bottom:10px">
              ${e(this.grouped[this.activeTab].name)}
              <span style="font-size:12px;color:var(--text-dim);margin-left:8px">
                临时属性值总计：${this.grouped[this.activeTab].totalTempValue.toFixed(1)}
              </span>
            </div>
            <div style="margin-bottom:8px">
              <button class="btn btn-small btn-secondary" onclick="InventoryPage.selectAll()">全选</button>
              <button class="btn btn-small btn-secondary" style="margin-left:4px" onclick="InventoryPage.selectNone()">取消</button>
            </div>
            ${this.grouped[this.activeTab].items.map(item => `
              <div class="item-row">
                <input type="checkbox" class="item-check"
                  ${this.selectedIds.has(item.id) ? 'checked' : ''}
                  onchange="InventoryPage.toggleItem(${item.id})">
                <div class="item-info" style="margin-left:10px">
                  ${(() => {
                    const q = ['凡品', '良品', '上品', '极品'].includes(item.quality) ? item.quality : '凡品';
                    return `<div class="item-name quality-${q}">${e(item.name)}</div>`;
                  })()}
                  <div class="item-meta">${e(item.quality)} · 临时属性 +${item.temp_value}</div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>

      ${this.selectedIds.size > 0 ? `
        <div class="synth-summary">
          <div class="synth-info">
            已选${this.selectedIds.size}件 · 总值${selectedTotal.toFixed(1)}
            ${permanentGain > 0 ? `<br><span class="synth-gain">可合成 +${permanentGain}点永久属性</span>` : `<br><span style="color:var(--red)">不足10点，无法合成</span>`}
            ${selectedTotal % 10 > 0 && permanentGain > 0 ? `<br><span style="font-size:11px;color:var(--text-dim)">浪费${(selectedTotal - permanentGain * 10).toFixed(1)}点</span>` : ''}
          </div>
          <button class="btn btn-primary btn-small" ${permanentGain < 1 ? 'disabled' : ''}
            onclick="InventoryPage.synthesize()" style="width:80px">合成</button>
        </div>
      ` : ''}
    `;
  },

  switchSection(section) {
    this.activeSection = section;
    this.render();
  },

  switchTab(tab) {
    this.activeTab = tab;
    this.selectedIds.clear();
    this.render();
  },

  switchTabByIndex(index) {
    const tabs = Object.keys(this.grouped || {});
    const tab = tabs[index];
    if (!tab) return;
    this.switchTab(tab);
  },

  toggleItem(id) {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
    this.render();
  },

  selectAll() {
    if (!this.activeTab || !this.grouped[this.activeTab]) return;
    for (const item of this.grouped[this.activeTab].items) {
      this.selectedIds.add(item.id);
    }
    this.render();
  },

  selectNone() {
    this.selectedIds.clear();
    this.render();
  },

  getSelectedTempValue() {
    let total = 0;
    for (const item of this.items) {
      if (this.selectedIds.has(item.id)) total += item.temp_value;
    }
    return total;
  },

  async synthesize() {
    const ids = [...this.selectedIds];
    if (ids.length === 0) return;

    try {
      const result = await API.post('/items/synthesize', { item_ids: ids });
      App.toast(`合成成功！${result.attribute} +${result.gain}，当前${result.newValue}/${result.cap}`, 'success');
      this.load();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async redeem(id) {
    try {
      await API.post(`/rewards/${id}/redeem`);
      App.toast('奖励已标记为兑现', 'success');
      this.load();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },
};
