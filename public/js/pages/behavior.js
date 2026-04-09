const BehaviorPage = {
  categories: null,
  shortcuts: null, // V2-F01 FB-05 - Top5 常用行为
  lastBehavior: null, // V2-F01 FB-05 - 最近一次行为，用于一键重复
  selectedCategory: null,
  selectedSubCategory: null,
  selectedBehavior: null,
  showCustomForm: false,
  activeTab: 'report', // V2-F07 - 历史 tab 状态
  historyData: null, // V2-F07 - { 'YYYY-MM-DD': [{...}] }
  selectedDate: null, // V2-F07 - 当前选中日期字符串
  weeklySummary: null, // V2-F07 - { behavior_count, item_count }
  historyYear: null, // V2-F07 - 当前查看年份（null = 当前月）
  historyMonth: null, // V2-F07 - 当前查看月份（null = 当前月）

  async load() {
    try {
      // V2-F01 FB-05 - 并行加载 categories、shortcuts、lastBehavior
      const [categories, shortcuts, lastBehavior] = await Promise.all([
        this.categories ? Promise.resolve(this.categories) : API.get('/behavior/categories'),
        API.get('/behavior/shortcuts'),
        API.get('/behavior/last'),
      ]);
      this.categories = categories;
      this.shortcuts = shortcuts;
      this.lastBehavior = lastBehavior;
      this.render();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  isGroupedCategory(category) {
    if (!category || !this.categories?.[category]) return false;
    return !Array.isArray(this.categories[category]);
  },

  getBehaviorList(category, subCategory) {
    if (!category || !this.categories?.[category]) return [];
    const data = this.categories[category];
    if (Array.isArray(data)) return data;
    if (!subCategory || !Array.isArray(data[subCategory])) return [];
    return data[subCategory];
  },

  render() {
    const container = document.getElementById('page-behavior');
    const e = API.escapeHtml.bind(API);

    // V2-F07 - tab 切换：上报 | 历史
    const tabBar = `
      <div style="display:flex;gap:0;margin-bottom:12px;border-bottom:1px solid var(--border)">
        <button class="btn btn-small ${this.activeTab === 'report' ? 'btn-primary' : 'btn-secondary'}"
          style="border-radius:6px 0 0 0"
          onclick="BehaviorPage.switchTab('report')">上报</button>
        <button class="btn btn-small ${this.activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}"
          style="border-radius:0 6px 0 0"
          onclick="BehaviorPage.switchTab('history')">历史</button>
      </div>
    `;

    if (this.activeTab === 'history') {
      container.innerHTML = tabBar + this.renderHistory();
      this.loadHistory(); // V2-F07 - 加载历史数据（含 weekly-summary）
      return;
    }

    const cats = Object.keys(this.categories || {});
    const grouped = this.isGroupedCategory(this.selectedCategory);
    const subCategories = grouped ? Object.keys(this.categories[this.selectedCategory] || {}) : [];
    const list = this.getBehaviorList(this.selectedCategory, this.selectedSubCategory);

    container.innerHTML = tabBar + `
      <div class="page-header">行为上报</div>

      ${this.renderShortcuts()}

      <div class="card">
        <div class="card-title">选择行为类型</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          ${cats.map((c, idx) => `
            <button class="btn btn-small ${this.selectedCategory === c ? 'btn-primary' : 'btn-secondary'}"
              onclick="BehaviorPage.selectCategoryByIndex(${idx})">${e(c)}</button>
          `).join('')}
        </div>

        ${this.selectedCategory && grouped ? `
          <div class="card-title" style="margin-top:8px">选择训练部位</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">
            ${subCategories.map((sub, idx) => `
              <button class="btn btn-small ${this.selectedSubCategory === sub ? 'btn-primary' : 'btn-secondary'}"
                onclick="BehaviorPage.selectSubCategoryByIndex(${idx})">${e(sub)}</button>
            `).join('')}
          </div>
        ` : ''}

        ${this.selectedCategory ? `
          <div class="card-title" style="margin-top:8px">选择具体行为</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${list.map((b, idx) => `
              <button class="btn btn-small ${this.selectedBehavior?.name === b.name ? 'btn-primary' : 'btn-secondary'}"
                onclick="BehaviorPage.selectBehaviorByIndex(${idx})">${e(b.name)}</button>
            `).join('')}
            <button class="btn btn-small btn-secondary" onclick="BehaviorPage.openAddCustom()">➕ 自定义</button>
          </div>
        ` : ''}
      </div>

      ${this.showCustomForm ? this.renderCustomForm() : ''}

      ${this.selectedBehavior ? this.renderInputForm() : ''}

      <div class="card" style="margin-top:16px">
        <div class="card-title">最近记录</div>
        <div id="behavior-history"></div>
      </div>
    `;

    this.loadRecentHistory(); // V2-F07 - report tab 保持最近记录加载
  },

  // V2-F07 - 渲染历史 tab（本周汇总 + 月历 + 日期详情）
  renderHistory() {
    const e = API.escapeHtml.bind(API);
    const now = new Date();
    const year = this.historyYear ?? now.getFullYear();
    const month = this.historyMonth ?? (now.getMonth() + 1);
    const data = this.historyData ?? {};
    const summary = this.weeklySummary;

    const summaryCard = summary ? `
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">本周汇总</div>
        <div style="display:flex;gap:24px;font-size:14px">
          <span>行为 <strong>${summary.behavior_count}</strong> 次</span>
          <span>道具 <strong>${summary.item_count}</strong> 件</span>
        </div>
      </div>
    ` : '<div class="card" style="margin-bottom:12px"><div class="item-meta">加载中…</div></div>';

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;

    const calHeader = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <button class="btn btn-small btn-secondary"
          onclick="BehaviorPage.navMonth(${prevYear},${prevMonth})">‹</button>
        <span style="font-weight:600">${year} 年 ${month} 月</span>
        <button class="btn btn-small btn-secondary"
          onclick="BehaviorPage.navMonth(${nextYear},${nextMonth})">›</button>
      </div>
    `;

    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const weekLabels = ['日', '一', '二', '三', '四', '五', '六']
      .map(d => `<div style="text-align:center;font-size:11px;color:var(--text-dim)">${d}</div>`)
      .join('');

    let cells = '';
    for (let i = 0; i < firstDay; i++) cells += '<div></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const hasBehavior = !!data[dateStr];
      const isSelected = this.selectedDate === dateStr;
      cells += `
        <div onclick="BehaviorPage.selectDate('${dateStr}')"
          style="text-align:center;padding:6px 2px;border-radius:6px;cursor:pointer;font-size:13px;
                 background:${isSelected ? 'var(--primary)' : hasBehavior ? 'var(--primary-dim, #e8f4ff)' : 'transparent'};
                 color:${isSelected ? '#fff' : 'inherit'};
                 font-weight:${hasBehavior ? '600' : '400'}">
          ${d}
        </div>`;
    }

    const calGrid = `
      <div class="card" style="margin-bottom:12px">
        ${calHeader}
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">
          ${weekLabels}
          ${cells}
        </div>
      </div>
    `;

    let dateDetail = '';
    if (this.selectedDate && data[this.selectedDate]) {
      const rows = data[this.selectedDate];
      dateDetail = `
        <div class="card">
          <div class="card-title">${this.selectedDate} 的行为记录</div>
          ${rows.map(b => `
            <div class="item-row">
              <div class="item-info">
                <div class="item-name">${e(b.sub_type)}</div>
                <div class="item-meta">
                  ${(() => {
                    const q = ['凡品', '良品', '上品', '极品'].includes(b.quality) ? b.quality : '凡品';
                    return `<span class="quality-${q}">${e(b.quality)}</span>`;
                  })()}
                  ${b.item_name ? `· ${e(b.item_name)}` : ''}
                </div>
              </div>
              <div class="item-meta">${new Date(b.completed_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          `).join('')}
        </div>
      `;
    } else if (this.selectedDate) {
      dateDetail = '<div class="card"><div class="empty-state">当天没有行为记录</div></div>';
    }

    return summaryCard + calGrid + dateDetail;
  },

  // V2-F01 FB-05 - 渲染常用行为快捷入口卡片
  renderShortcuts() {
    const hasShortcuts = this.shortcuts && this.shortcuts.length > 0;
    const hasLast = !!this.lastBehavior;
    if (!hasShortcuts && !hasLast) return '';

    const e = API.escapeHtml.bind(API);
    return `
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">常用行为</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">
          ${hasShortcuts ? this.shortcuts.map((s, idx) => `
          <button class="btn btn-small btn-secondary"
            onclick="BehaviorPage.selectShortcut(${idx})">
            ${e(s.sub_type)}
          </button>
        `).join('') : ''}
        </div>
        ${hasLast ? `
        <button class="btn btn-small btn-secondary" onclick="BehaviorPage.repeatLast()">
          🔁 重复上次：${e(this.lastBehavior.sub_type)}
        </button>
      ` : ''}
      </div>
    `;
  },

  renderInputForm() {
    const b = this.selectedBehavior;
    const e = API.escapeHtml.bind(API);
    let inputHtml = '';

    if (b.template === 'duration') {
      inputHtml = `
        <div class="form-group">
          <label>时长（分钟）</label>
          <input type="number" id="behavior-duration" placeholder="输入时长" min="1">
        </div>
      `;
    } else if (b.template === 'quantity') {
      inputHtml = `
        <div class="form-group">
          <label>数量（基础量：${e(b.baseQuantity || '无')}）</label>
          <input type="number" id="behavior-quantity" placeholder="输入数量" min="1">
        </div>
      `;
    }

    return `
      <div class="card">
        <div class="card-title">${e(b.name)} ${b.template === 'checkin' ? '（打卡）' : ''}</div>
        ${inputHtml}
        <div class="form-group">
          <label>备注（可选）</label>
          <input type="text" id="behavior-desc" placeholder="简单描述一下">
        </div>
        <button class="btn btn-primary" onclick="BehaviorPage.submit()">
          ${b.template === 'checkin' ? '打卡' : '提交'}
        </button>
      </div>
    `;
  },

  renderCustomForm() {
    return `
      <div class="card">
        <div class="card-title">新增自定义行为</div>
        <div class="form-group">
          <label>行为名称</label>
          <input type="text" id="custom-name" placeholder="例如：波比跳">
        </div>
        <div class="form-group">
          <label>品质判定模板</label>
          <select id="custom-template" onchange="BehaviorPage.updateCustomFormPreview()">
            <option value="duration">时长型</option>
            <option value="quantity">数量型</option>
            <option value="checkin">打卡型</option>
          </select>
        </div>
        <div class="form-group" id="custom-base-quantity-group" style="display:none">
          <label>基础量（数量型必填）</label>
          <input type="number" id="custom-base-quantity" placeholder="例如：20" min="1">
        </div>

        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="custom-instant-report" onchange="BehaviorPage.updateCustomFormPreview()" style="width:auto" checked>
            同时上报一条（可取消）
          </label>
        </div>
        <div id="custom-instant-fields" style="display:none">
          <div class="form-group" id="custom-instant-duration-group">
            <label>本次时长（分钟）</label>
            <input type="number" id="custom-instant-duration" placeholder="例如：30" min="1">
          </div>
          <div class="form-group" id="custom-instant-quantity-group" style="display:none">
            <label>本次数量</label>
            <input type="number" id="custom-instant-quantity" placeholder="例如：40" min="1">
          </div>
          <div class="form-group" id="custom-instant-checkin-tip" style="display:none">
            <div style="font-size:12px;color:var(--text-dim)">打卡型无需额外填写数值，提交即记为一次打卡。</div>
          </div>
          <div class="form-group">
            <label>本次备注（可选）</label>
            <input type="text" id="custom-instant-desc" placeholder="例如：晚饭后训练">
          </div>
        </div>

        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" onclick="BehaviorPage.closeAddCustom()">取消</button>
          <button class="btn btn-primary" onclick="BehaviorPage.submitCustom()">保存</button>
        </div>
      </div>
    `;
  },

  // V2-F07 - 切换 tab
  switchTab(tab) {
    this.activeTab = tab;
    this.render();
  },

  selectCategory(category) {
    this.selectedCategory = category;
    this.selectedBehavior = null;
    this.showCustomForm = false;

    if (this.isGroupedCategory(category)) {
      const subs = Object.keys(this.categories[category] || {});
      this.selectedSubCategory = subs[0] || null;
    } else {
      this.selectedSubCategory = null;
    }

    this.render();
  },

  selectCategoryByIndex(index) {
    const cats = Object.keys(this.categories || {});
    const category = cats[index];
    if (!category) return;
    this.selectCategory(category);
  },

  selectSubCategory(subCategory) {
    this.selectedSubCategory = subCategory;
    this.selectedBehavior = null;
    this.showCustomForm = false;
    this.render();
  },

  selectSubCategoryByIndex(index) {
    if (!this.selectedCategory || !this.isGroupedCategory(this.selectedCategory)) return;
    const subs = Object.keys(this.categories[this.selectedCategory] || {});
    const sub = subs[index];
    if (!sub) return;
    this.selectSubCategory(sub);
  },

  selectBehavior(behavior) {
    this.selectedBehavior = behavior;
    this.render();
  },

  selectBehaviorByIndex(index) {
    const list = this.getBehaviorList(this.selectedCategory, this.selectedSubCategory);
    const behavior = list[index];
    if (!behavior) return;
    this.selectBehavior(behavior);
  },

  // V2-F01 FB-05 - 点击常用行为，直接跳到确认步骤
  selectShortcut(index) {
    const s = this.shortcuts[index];
    if (!s) return;

    // V2-F01 FB-05 - 设置 category
    this.selectedCategory = s.category;
    this.showCustomForm = false;

    // V2-F01 FB-05 - 设置 sub_category（分组类行为）
    if (s.sub_category) {
      this.selectedSubCategory = s.sub_category;
    } else if (this.isGroupedCategory(s.category)) {
      // V2-F01 FB-05 - sub_category 为 null 但是分组类，降级选第一个子分类
      const subs = Object.keys(this.categories[s.category] || {});
      this.selectedSubCategory = subs[0] || null;
    } else {
      this.selectedSubCategory = null;
    }

    // V2-F01 FB-05 - 查找 behaviorDef
    const list = this.getBehaviorList(this.selectedCategory, this.selectedSubCategory);
    const behavior = list.find(b => b.name === s.sub_type);
    if (!behavior) {
      App.toast('该行为已不存在，请手动选择', 'error');
      this.selectedBehavior = null;
      this.render();
      return;
    }

    this.selectedBehavior = behavior;
    this.render();
  },

  // V2-F01 FB-05 - 一键重复上次行为，预填充上次数值
  repeatLast() {
    const last = this.lastBehavior;
    if (!last) return;

    this.selectedCategory = last.category;
    this.showCustomForm = false;

    if (last.sub_category) {
      this.selectedSubCategory = last.sub_category;
    } else if (this.isGroupedCategory(last.category)) {
      const subs = Object.keys(this.categories[last.category] || {});
      this.selectedSubCategory = subs[0] || null;
    } else {
      this.selectedSubCategory = null;
    }

    const list = this.getBehaviorList(this.selectedCategory, this.selectedSubCategory);
    const behavior = list.find(b => b.name === last.sub_type);
    if (!behavior) {
      App.toast('该行为已不存在，请手动选择', 'error');
      this.selectedBehavior = null;
      this.render();
      return;
    }

    this.selectedBehavior = behavior;
    this.render();

    // V2-F01 FB-05 - 预填充上次数值
    if (last.duration) {
      const el = document.getElementById('behavior-duration');
      if (el) el.value = last.duration;
    }
    if (last.quantity) {
      const el = document.getElementById('behavior-quantity');
      if (el) el.value = last.quantity;
    }
    if (last.description) {
      const el = document.getElementById('behavior-desc');
      if (el) el.value = last.description;
    }
  },

  async openAddCustom() {
    if (!this.selectedCategory) return;
    this.showCustomForm = true;
    this.selectedBehavior = null;
    this.render();
    this.updateCustomFormPreview();
  },

  closeAddCustom() {
    this.showCustomForm = false;
    this.render();
  },

  updateCustomFormPreview() {
    const template = document.getElementById('custom-template')?.value || 'duration';
    const instant = document.getElementById('custom-instant-report')?.checked;

    const baseGroup = document.getElementById('custom-base-quantity-group');
    if (baseGroup) baseGroup.style.display = template === 'quantity' ? 'block' : 'none';

    const instantFields = document.getElementById('custom-instant-fields');
    if (instantFields) instantFields.style.display = instant ? 'block' : 'none';

    const durationGroup = document.getElementById('custom-instant-duration-group');
    const quantityGroup = document.getElementById('custom-instant-quantity-group');
    const checkinTip = document.getElementById('custom-instant-checkin-tip');
    if (durationGroup) durationGroup.style.display = template === 'duration' ? 'block' : 'none';
    if (quantityGroup) quantityGroup.style.display = template === 'quantity' ? 'block' : 'none';
    if (checkinTip) checkinTip.style.display = template === 'checkin' ? 'block' : 'none';
  },

  async submitCustom() {
    if (!this.selectedCategory) return;

    const name = (document.getElementById('custom-name')?.value || '').trim();
    const template = document.getElementById('custom-template')?.value || 'duration';
    const instant = !!document.getElementById('custom-instant-report')?.checked;
    const desc = (document.getElementById('custom-instant-desc')?.value || '').trim();

    if (!name) {
      App.toast('请输入行为名称', 'error');
      return;
    }

    let baseQuantity = null;
    if (template === 'quantity') {
      const rawBase = document.getElementById('custom-base-quantity')?.value;
      baseQuantity = Number.parseInt(rawBase, 10);
      if (!Number.isInteger(baseQuantity) || baseQuantity <= 0) {
        App.toast('数量型行为需要填写基础量', 'error');
        return;
      }
    }

    const reportBody = {
      category: this.selectedCategory,
      sub_type: name,
      description: desc,
    };
    if (this.isGroupedCategory(this.selectedCategory)) {
      reportBody.sub_category = '自定义';
    }
    if (template === 'duration') {
      const v = Number.parseInt(document.getElementById('custom-instant-duration')?.value, 10);
      if (instant && (!Number.isInteger(v) || v <= 0)) {
        App.toast('请填写本次时长', 'error');
        return;
      }
      if (instant) reportBody.duration = v;
    }
    if (template === 'quantity') {
      const v = Number.parseInt(document.getElementById('custom-instant-quantity')?.value, 10);
      if (instant && (!Number.isInteger(v) || v <= 0)) {
        App.toast('请填写本次数量', 'error');
        return;
      }
      if (instant) reportBody.quantity = v;
    }

    let created = false;
    try {
      await API.post('/behavior/custom', {
        category: this.selectedCategory,
        name,
        template,
        base_quantity: baseQuantity,
      });
      created = true;
    } catch (e) {
      const msg = e?.message || '提交失败';
      const duplicated = msg.includes('已存在');
      if (!(instant && duplicated)) {
        App.toast(msg, 'error');
        return;
      }
    }

    try {
      this.categories = await API.get('/behavior/categories');
      if (this.isGroupedCategory(this.selectedCategory) && this.categories[this.selectedCategory]['自定义']) {
        this.selectedSubCategory = '自定义';
      }

      if (instant) {
        const result = await API.post('/behavior', reportBody);
        const item = result.item;
        const attrNameMap = {
          physique: '体魄', comprehension: '悟性', willpower: '心性', dexterity: '灵巧', perception: '神识',
        };
        App.toast(
          `${created ? '已新增并上报' : '已上报'}：${item.name}（${item.quality}）+${item.temp_value}临时${attrNameMap[item.attribute_type] || item.attribute_type}`,
          'success'
        );
      } else {
        App.toast(created ? '自定义行为已添加' : '行为已存在', 'success');
      }

      const currentList = this.getBehaviorList(this.selectedCategory, this.selectedSubCategory);
      this.selectedBehavior = currentList.find(b => b.name === name) || null;
      this.showCustomForm = false;
      this.render();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async submit() {
    const b = this.selectedBehavior;
    if (!b || !this.selectedCategory) return;

    const body = {
      category: this.selectedCategory,
      sub_type: b.name,
      description: document.getElementById('behavior-desc')?.value || '',
    };
    if (this.selectedSubCategory) {
      body.sub_category = this.selectedSubCategory;
    }

    if (b.template === 'duration') {
      const dur = parseInt(document.getElementById('behavior-duration')?.value, 10);
      if (!dur || dur < 1) { App.toast('请输入时长', 'error'); return; }
      body.duration = dur;
    } else if (b.template === 'quantity') {
      const qty = parseInt(document.getElementById('behavior-quantity')?.value, 10);
      if (!qty || qty < 1) { App.toast('请输入数量', 'error'); return; }
      body.quantity = qty;
    }

    try {
      const result = await API.post('/behavior', body);
      const item = result.item;
      const attrNameMap = {
        physique: '体魄', comprehension: '悟性', willpower: '心性', dexterity: '灵巧', perception: '神识',
      };
      App.toast(`获得 ${item.name}（${item.quality}）+${item.temp_value}临时${attrNameMap[item.attribute_type] || item.attribute_type}`, 'success');
      this.selectedBehavior = null;

      // V2-F01 FB-05 - 上报成功后刷新快捷入口数据
      Promise.all([
        API.get('/behavior/shortcuts'),
        API.get('/behavior/last'),
      ]).then(([shortcuts, lastBehavior]) => {
        this.shortcuts = shortcuts;
        this.lastBehavior = lastBehavior;
        this.render();
      }).catch(() => {});

      this.render();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  // V2-F07 - 加载历史 tab 数据（月历 + 本周汇总）
  async loadHistory() {
    const now = new Date();
    const year = this.historyYear ?? now.getFullYear();
    const month = this.historyMonth ?? (now.getMonth() + 1);

    try {
      const [grouped, summary] = await Promise.all([
        API.get(`/behavior/history?year=${year}&month=${String(month).padStart(2, '0')}`),
        this.weeklySummary ? Promise.resolve(this.weeklySummary) : API.get('/behavior/weekly-summary'),
      ]);
      this.historyData = grouped;
      this.weeklySummary = summary;
      this.historyYear = year;
      this.historyMonth = month;

      const el = document.getElementById('page-behavior');
      if (el && this.activeTab === 'history') {
        el.innerHTML = `
          <div style="display:flex;gap:0;margin-bottom:12px;border-bottom:1px solid var(--border)">
            <button class="btn btn-small btn-secondary" style="border-radius:6px 0 0 0"
              onclick="BehaviorPage.switchTab('report')">上报</button>
            <button class="btn btn-small btn-primary" style="border-radius:0 6px 0 0"
              onclick="BehaviorPage.switchTab('history')">历史</button>
          </div>
        ` + this.renderHistory();
      }
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  // V2-F07 - 选中日期，展示当天行为列表
  selectDate(dateStr) {
    this.selectedDate = this.selectedDate === dateStr ? null : dateStr;
    const el = document.getElementById('page-behavior');
    if (el) {
      el.innerHTML = `
        <div style="display:flex;gap:0;margin-bottom:12px;border-bottom:1px solid var(--border)">
          <button class="btn btn-small btn-secondary" style="border-radius:6px 0 0 0"
            onclick="BehaviorPage.switchTab('report')">上报</button>
          <button class="btn btn-small btn-primary" style="border-radius:0 6px 0 0"
            onclick="BehaviorPage.switchTab('history')">历史</button>
        </div>
      ` + this.renderHistory();
    }
  },

  // V2-F07 - 切换月份
  navMonth(year, month) {
    this.historyYear = year;
    this.historyMonth = month;
    this.historyData = null;
    this.selectedDate = null;
    this.render();
  },

  async loadRecentHistory() {
    try {
      const e = API.escapeHtml.bind(API);
      const list = await API.get('/behavior/list');
      const el = document.getElementById('behavior-history');
      if (!el) return;

      if (list.length === 0) {
        el.innerHTML = '<div class="empty-state">还没有行为记录</div>';
        return;
      }

      el.innerHTML = list.slice(0, 10).map(b => `
        <div class="item-row">
          <div class="item-info">
            <div class="item-name">${e(b.sub_type)}</div>
            <div class="item-meta">
              ${e(b.category)}
              ${b.duration ? `· ${b.duration}分钟` : ''}
              ${b.quantity ? `· ${b.quantity}个` : ''}
              ${(() => {
                const q = ['凡品', '良品', '上品', '极品'].includes(b.quality) ? b.quality : '凡品';
                return `· <span class="quality-${q}">${e(b.quality)}</span>`;
              })()}
            </div>
          </div>
          <div style="text-align:right">
            ${(() => {
              const q = ['凡品', '良品', '上品', '极品'].includes(b.item_quality) ? b.item_quality : '凡品';
              return `<div class="item-name quality-${q}">${e(b.item_name || '')}</div>`;
            })()}
            <div class="item-meta">${new Date(b.completed_at).toLocaleDateString()}</div>
          </div>
        </div>
      `).join('');
    } catch {
      // silently fail
    }
  },
};
