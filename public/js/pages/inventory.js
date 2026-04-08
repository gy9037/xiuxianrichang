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
      // V2-F02 FB-02 - 首次进入背包页自动弹出合成规则说明
      if (!localStorage.getItem('synthesis_rule_shown')) {
        // V2-F02 FB-02
        localStorage.setItem('synthesis_rule_shown', '1');
        // V2-F02 FB-02
        setTimeout(() => this.showSynthesisRule(), 300);
      }
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  render() {
    const container = document.getElementById('page-inventory');
    const e = API.escapeHtml.bind(API);

    container.innerHTML = `
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
        <span>背包</span>
        <span style="font-size:13px;color:var(--primary);cursor:pointer"
          onclick="InventoryPage.showSynthesisRule()">⚗️ 炼化规则</span>
      </div>
      <!-- V2-F02 FB-02 - 右上角随时可查看合成规则 -->
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

  // V2-F02 FB-02 - 合成规则说明弹窗
  showSynthesisRule() {
    // V2-F02 FB-02
    const existing = document.getElementById('synthesis-rule-modal');
    // V2-F02 FB-02
    if (existing) existing.remove();

    // V2-F02 FB-02
    const modal = document.createElement('div');
    // V2-F02 FB-02
    modal.id = 'synthesis-rule-modal';
    // V2-F02 FB-02
    modal.style.cssText = `
      position:fixed;top:0;left:0;right:0;bottom:0;
      background:rgba(0,0,0,0.7);z-index:200;
      display:flex;align-items:center;justify-content:center;padding:24px;
    `;
    // V2-F02 FB-02
    modal.innerHTML = `
      <div style="background:var(--bg-card);border-radius:var(--radius);padding:24px;max-width:320px;width:100%">
        <div style="font-size:16px;font-weight:700;color:var(--gold);margin-bottom:16px">⚗️ 炼化规则</div>
        <div style="font-size:13px;color:var(--text-dim);line-height:1.8"> <!-- V2-F02 FB-02 -->
          <p>每次行为上报会生成一个<b>修仙道具</b>，道具有临时属性值：</p>
          <p>· 凡品 = 1点 &nbsp; 良品 = 1.5点</p>
          <p>· 上品 = 2点 &nbsp; 极品 = 3点</p>
          <p style="margin-top:12px">选择同属性道具进行<b>炼化</b>，规则如下：</p>
          <p>· 临时属性值总和 ÷ 10 取整 = 获得永久属性</p>
          <p>· 余数部分会随道具一起消耗（浪费）</p>
          <p style="margin-top:12px;color:var(--text-dim)">示例：10个凡品（总值10）→ 永久+1，无浪费</p>
          <p style="color:var(--text-dim)">示例：7个良品（总值10.5）→ 永久+1，浪费0.5</p>
        </div>
        <button class="btn btn-primary" style="width:100%;margin-top:20px"
          onclick="document.getElementById('synthesis-rule-modal').remove()">明白了</button>
      </div>
    `;
    // V2-F02 FB-02
    document.body.appendChild(modal);
  },
};
