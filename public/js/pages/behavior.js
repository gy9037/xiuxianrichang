const BehaviorPage = {
  categories: null,
  shortcuts: null, // V2-F01 FB-05 - Top5 常用行为
  lastBehavior: null, // V2-F01 FB-05 - 最近一次行为，用于一键重复
  selectedCategory: null,
  selectedBehavior: null,
  showCustomForm: false,
  submitting: false, // V25-006 - submit 防重复点击
  submittingCustom: false, // V25-010 - submitCustom 防重复点击
  pendingCategory: null, // V2.5 V25-035
  activeTab: 'report', // V2-F07 - 历史 tab 状态
  historyData: null, // V2-F07 - { 'YYYY-MM-DD': [{...}] }
  selectedDate: null, // V2-F07 - 当前选中日期字符串
  weeklySummary: null, // V2.5 - 周报数据 { week_start, week_end, behavior_count, item_count, active_days, category_distribution, quality_distribution, streak, streak_note }
  historyYear: null, // V2-F07 - 当前查看年份（null = 当前月）
  historyMonth: null, // V2-F07 - 当前查看月份（null = 当前月）
  showRecentHistory: false,

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

      if (this.selectedCategory === null) {
        const savedCat = localStorage.getItem('behavior_last_category');
        if (savedCat && this.categories[savedCat]) {
          this.selectedCategory = savedCat;
        }
      }

      this.render();

      // V2.5 V25-035 - 消费 pendingCategory
      if (this.pendingCategory) {
        this.selectCategory(this.pendingCategory);
        this.pendingCategory = null;
      }
    } catch (e) {
      App.toast(e.message, 'error');
      // V25-081 - 加载失败时渲染错误提示卡片 + 重试按钮
      const container = document.getElementById('page-behavior');
      if (container) {
        container.innerHTML = `
          <div class="card" style="text-align:center;padding:32px 16px">
            <div style="font-size:16px;margin-bottom:12px;color:var(--text-dim)">加载失败</div>
            <div style="font-size:13px;color:var(--text-dim);margin-bottom:16px">${API.escapeHtml(e.message)}</div>
            <button class="btn btn-primary" style="width:auto;padding:10px 32px" onclick="BehaviorPage.load()">重试</button>
          </div>
        `;
      }
    }
  },

  // V25-038 - 抽取 tab bar 渲染，消除三处重复
  renderTabBar() {
    return `
      <div style="display:flex;gap:0;margin-bottom:12px;border-bottom:1px solid var(--border)">
        <button class="btn btn-small ${this.activeTab === 'report' ? 'btn-primary' : 'btn-secondary'}"
          style="border-radius:6px 0 0 0"
          onclick="BehaviorPage.switchTab('report')">上报</button>
        <button class="btn btn-small ${this.activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}"
          style="border-radius:0 6px 0 0"
          onclick="BehaviorPage.switchTab('history')">历史</button>
      </div>
    `;
  },

  render() {
    const container = document.getElementById('page-behavior');
    const e = API.escapeHtml.bind(API);

    // V2-F07 - tab 切换：上报 | 历史
    const tabBar = this.renderTabBar(); // V25-038

    if (this.activeTab === 'history') {
      container.innerHTML = tabBar + this.renderHistory();
      this.loadHistory(); // V2-F07 - 加载历史数据（含 weekly-summary）
      return;
    }

    const cats = Object.keys(this.categories || {});
    const list = this.selectedCategory ? (this.categories[this.selectedCategory] || []) : [];

    container.innerHTML = tabBar + `
      <div class="card">
        ${this.renderInlineShortcuts()}
        <div class="card-title" style="margin-bottom:8px">选择行为类型</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          ${cats.map((c, idx) => `
            <button class="btn btn-small ${this.selectedCategory === c ? 'btn-primary' : 'btn-secondary'}"
              onclick="BehaviorPage.selectCategoryByIndex(${idx})">${e(c)}</button>
          `).join('')}
        </div>
        ${this.selectedCategory ? `
          <div class="card-title" style="margin-top:4px;margin-bottom:8px">选择行为</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${list.map((b, idx) => `
              <button class="btn btn-small ${this.selectedBehavior === b ? 'btn-primary' : 'btn-secondary'}"
                onclick="BehaviorPage.selectBehaviorByIndex(${idx})">${e(b)}</button>
            `).join('')}
            <button class="btn btn-small btn-secondary" onclick="BehaviorPage.openAddCustom()">➕ 自定义</button>
          </div>
        ` : ''}
        ${this.showCustomForm ? this.renderInlineCustomForm() : ''}
        ${this.selectedBehavior ? this.renderInlineInputForm() : ''}
      </div>
      <div class="card" style="margin-top:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer"
          onclick="BehaviorPage.toggleRecentHistory()">
          <span class="card-title" style="margin-bottom:0">最近记录</span>
          <span style="font-size:12px;color:var(--text-dim)">${this.showRecentHistory ? '收起 ▴' : '展开 ▾'}</span>
        </div>
        ${this.showRecentHistory ? '<div id="behavior-history"></div>' : ''}
      </div>
    `;

    if (this.showRecentHistory) {
      this.loadRecentHistory();
    }
  },

  toggleRecentHistory() {
    this.showRecentHistory = !this.showRecentHistory;
    this.render();
  },

  // V2.5 - 周报卡片渲染
  renderWeeklyReport(summary) {
    if (!summary) {
      return '<div class="card" style="margin-bottom:12px"><div class="item-meta">加载中…</div></div>';
    }

    // 格式化日期 YYYY-MM-DD → M/D
    const fmtDate = (s) => { const p = s.split('-'); return `${+p[1]}/${+p[2]}`; };

    // 区块 1 — 本周概览
    const overviewBlock = `
      <div class="card-title">本周修炼报告（${fmtDate(summary.week_start)} - ${fmtDate(summary.week_end)}）</div>
      <div style="display:flex;gap:24px;font-size:14px;margin-bottom:16px">
        <span>行为 <strong>${summary.behavior_count}</strong> 次</span>
        <span>道具 <strong>${summary.item_count}</strong> 件</span>
        <span>活跃 <strong>${summary.active_days}/7</strong> 天</span>
      </div>
    `;

    // 区块 2 — 类别分布（横向条形图）
    let categoryBlock = '';
    if (summary.category_distribution && summary.category_distribution.length > 0) {
      const maxCount = summary.category_distribution[0].count;
      const bars = summary.category_distribution.map((c) => {
        const pct = maxCount > 0 ? Math.round((c.count / maxCount) * 100) : 0;
        return `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px">
            <span style="min-width:56px;text-align:right;color:var(--text-dim)">${c.category}</span>
            <div style="flex:1;height:8px;background:var(--bg-card-light, #f0f0f0);border-radius:4px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:var(--primary);border-radius:4px"></div>
            </div>
            <span style="min-width:28px;font-size:12px;color:var(--text-dim)">${c.count}次</span>
          </div>
        `;
      }).join('');
      categoryBlock = `<div style="margin-bottom:16px">${bars}</div>`;
    }

    // 区块 3 — 品质分布（一行标签）
    let qualityBlock = '';
    const qd = summary.quality_distribution;
    if (qd && Object.keys(qd).length > 0) {
      const qualityOrder = ['凡品', '良品', '上品', '极品'];
      const tags = qualityOrder
        .filter(q => qd[q])
        .map((q) => {
          const cls = ['凡品', '良品', '上品', '极品'].includes(q) ? q : '凡品';
          return `<span class="quality-${cls}" style="font-size:13px">${q} ×${qd[q]}</span>`;
        }).join('&nbsp;&nbsp;&nbsp;');
      if (tags) {
        qualityBlock = `<div style="margin-bottom:16px">${tags}</div>`;
      }
    }

    // 区块 4 — 连续修炼（streak）
    let streakBlock = '';
    if (summary.streak > 0) {
      const note = summary.streak_note ? `<span style="font-size:12px;color:var(--text-dim)">（${summary.streak_note}）</span>` : '';
      streakBlock = `<div style="font-size:14px">🔥 连续修炼 <strong>${summary.streak}</strong> 天${note}</div>`;
    } else {
      streakBlock = '<div style="font-size:13px;color:var(--text-dim)">今天开始新的连续修炼吧</div>';
    }

    return `
      <div class="card" style="margin-bottom:12px">
        ${overviewBlock}
        ${categoryBlock}
        ${qualityBlock}
        ${streakBlock}
      </div>
    `;
  },

  // V2-F07 - 渲染历史 tab（本周汇总 + 月历 + 日期详情）
  renderHistory() {
    const e = API.escapeHtml.bind(API);
    const now = new Date();
    const year = this.historyYear ?? now.getFullYear();
    const month = this.historyMonth ?? (now.getMonth() + 1);
    const data = this.historyData ?? {};
    const summary = this.weeklySummary;

    const summaryCard = this.renderWeeklyReport(summary); // V2.5 周报

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
      // V25-044 - 增大日历格子点击区域
      cells += `
        <div onclick="BehaviorPage.selectDate('${dateStr}')"
          style="min-width:36px;min-height:36px;display:flex;align-items:center;justify-content:center;
                 border-radius:6px;cursor:pointer;font-size:13px;
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

  renderInlineShortcuts() {
    const hasShortcuts = this.shortcuts && this.shortcuts.length > 0;
    const hasLast = !!this.lastBehavior;
    if (!hasShortcuts && !hasLast) return '';
    const e = API.escapeHtml.bind(API);
    return `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)">
        ${hasLast ? `
          <button class="btn btn-small btn-secondary" style="font-size:11px;padding:4px 10px;min-height:32px"
            onclick="BehaviorPage.repeatLast()">🔁 ${e(this.lastBehavior.sub_type)}</button>
        ` : ''}
        ${hasShortcuts ? this.shortcuts.map((s, idx) => {
          const isExercise = s.category === '身体健康';
          return `
            <button class="btn btn-small ${isExercise ? 'btn-secondary' : 'btn-success'}"
              style="font-size:11px;padding:4px 10px;min-height:32px"
              onclick="BehaviorPage.${isExercise ? 'selectShortcut' : 'quickSubmit'}(${idx})">
              ${isExercise ? '' : '✓ '}${e(s.sub_type)}
            </button>
          `;
        }).join('') : ''}
      </div>
    `;
  },

  renderInlineInputForm() {
    const e = API.escapeHtml.bind(API);
    const isExercise = this.selectedCategory === '身体健康';
    return `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)" id="input-form-card">
        <div style="font-size:14px;font-weight:600;margin-bottom:8px">${e(this.selectedBehavior)}</div>
        ${isExercise ? `
          <div class="form-group" style="margin-bottom:10px">
            <label>运动强度</label>
            <select id="behavior-intensity">
              <option value="低强度">低强度</option>
              <option value="热身">热身</option>
              <option value="高强度">高强度</option>
              <option value="拉伸">拉伸</option>
            </select>
          </div>
        ` : ''}
        <div class="form-group" style="margin-bottom:10px">
          <label>备注（可选）</label>
          <input type="text" id="behavior-desc" placeholder="例如：晚饭后散步30分钟">
        </div>
        <button class="btn btn-primary" id="submit-btn" onclick="BehaviorPage.submit()">提交</button>
      </div>
    `;
  },

  renderInlineCustomForm() {
    return `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <div style="font-size:14px;font-weight:600;margin-bottom:8px">自定义行为</div>
        <div class="form-group" style="margin-bottom:10px">
          <label>行为名称</label>
          <input type="text" id="custom-name" placeholder="输入行为名称" maxlength="30">
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-small btn-secondary" onclick="BehaviorPage.closeAddCustom()">取消</button>
          <button class="btn btn-small btn-primary" id="submit-custom-btn" onclick="BehaviorPage.submitCustom()">保存</button>
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

    localStorage.setItem('behavior_last_category', category);

    this.render();
  },

  selectCategoryByIndex(index) {
    const cats = Object.keys(this.categories || {});
    const category = cats[index];
    if (!category) return;
    this.selectCategory(category);
  },

  selectBehavior(behavior) {
    this.selectedBehavior = behavior; // behavior 现在是字符串
    this.render();
    // V25-041/042 - 选中行为后自动滚动到输入表单，解决键盘遮挡和滚动引导
    requestAnimationFrame(() => {
      document.getElementById('input-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  },

  selectBehaviorByIndex(index) {
    const list = this.categories?.[this.selectedCategory] || [];
    const behavior = list[index];
    if (!behavior) return;
    this.selectBehavior(behavior);
  },

  // V2-F01 FB-05 - 点击常用行为，直接跳到确认步骤
  selectShortcut(index) {
    const s = this.shortcuts[index];
    if (!s) return;

    this.selectedCategory = s.category;
    this.showCustomForm = false;

    if (!this.categories[s.category]?.includes(s.sub_type)) {
      App.toast('该行为已不存在，请手动选择', 'error');
      this.selectedCategory = null;
      this.selectedBehavior = null;
      this.render();
      return;
    }

    this.selectedBehavior = s.sub_type;
    this.render();
  },

  // V25-046 - 快捷一键打卡（非身体健康类别可直接提交）
  async quickSubmit(index) {
    const s = this.shortcuts[index];
    if (!s) return;

    if (s.category === '身体健康') {
      this.selectShortcut(index);
      return;
    }

    if (this.submitting) return; // 复用 V25-006 防重复标志

    this.submitting = true;
    try {
      const body = {
        category: s.category,
        sub_type: s.sub_type,
        description: '',
      };

      const result = await API.post('/behavior', body);
      const item = result.item;
      const attrNameMap = {
        physique: '体魄', comprehension: '悟性', willpower: '心性', dexterity: '灵巧', perception: '神识',
      };
      const cv = result.cultivationStatus;
      let toastMsg = `打卡成功：${item.name}（${item.quality}）+${item.temp_value}临时${attrNameMap[item.attribute_type] || item.attribute_type}`;
      if (cv) {
        toastMsg += ` · ${cv.level}（${cv.activeDays}/7天）`;
      }
      App.toast(toastMsg, 'success');

      // 刷新快捷入口数据
      try {
        const [shortcuts, lastBehavior] = await Promise.all([
          API.get('/behavior/shortcuts'),
          API.get('/behavior/last'),
        ]);
        this.shortcuts = shortcuts;
        this.lastBehavior = lastBehavior;
      } catch (_) {}

      this.render();
    } catch (e) {
      App.toast(e.message, 'error');
    } finally {
      this.submitting = false;
    }
  },

  // V2-F01 FB-05 - 一键重复上次行为，预填充上次文本/强度
  repeatLast() {
    const last = this.lastBehavior;
    if (!last) return;

    this.selectedCategory = last.category;
    this.showCustomForm = false;

    if (!this.categories[last.category]?.includes(last.sub_type)) {
      App.toast('该行为已不存在，请手动选择', 'error');
      this.selectedCategory = null;
      this.selectedBehavior = null;
      this.render();
      return;
    }

    this.selectedBehavior = last.sub_type;
    this.render();

    requestAnimationFrame(() => {
      if (last.description) {
        const el = document.getElementById('behavior-desc');
        if (el) el.value = last.description;
      }
      if (last.category === '身体健康' && last.intensity) {
        const el = document.getElementById('behavior-intensity');
        if (el) el.value = last.intensity;
      }
    });
  },

  async openAddCustom() {
    if (!this.selectedCategory) return;
    this.showCustomForm = true;
    this.selectedBehavior = null;
    this.render();
  },

  closeAddCustom() {
    this.showCustomForm = false;
    this.render();
  },

  async submitCustom() {
    if (!this.selectedCategory) return;
    if (this.submittingCustom) return; // V25-010 - 防重复点击

    // V25-010 - 设置提交中状态
    this.submittingCustom = true;
    const customBtn = document.getElementById('submit-custom-btn');
    if (customBtn) {
      customBtn.disabled = true;
      customBtn.textContent = '保存中…';
    }

    try {
      const name = (document.getElementById('custom-name')?.value || '').trim();
      if (!name) {
        App.toast('请输入行为名称', 'error');
        return;
      }

      await API.post('/behavior/custom', {
        category: this.selectedCategory,
        name,
      });

      // 刷新 categories
      this.categories = await API.get('/behavior/categories');

      // 自动选中新行为
      const list = this.categories[this.selectedCategory] || [];
      this.selectedBehavior = list.includes(name) ? name : null;
      this.showCustomForm = false;

      App.toast('自定义行为已添加', 'success');
      this.render();
    } catch (e) {
      App.toast(e.message, 'error');
    } finally {
      // V25-010 - 恢复按钮状态
      this.submittingCustom = false;
      const resetBtn = document.getElementById('submit-custom-btn');
      if (resetBtn) {
        resetBtn.disabled = false;
        resetBtn.textContent = '保存';
      }
    }
  },

  async submit() {
    if (this.submitting) return; // V25-006 - 防重复点击
    const b = this.selectedBehavior;
    if (!b || !this.selectedCategory) return;

    // V25-006 - 设置提交中状态
    this.submitting = true;
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '提交中…';
    }

    try {
      const body = {
        category: this.selectedCategory,
        sub_type: this.selectedBehavior,
        description: document.getElementById('behavior-desc')?.value || '',
      };

      if (this.selectedCategory === '身体健康') {
        body.intensity = document.getElementById('behavior-intensity')?.value || '低强度';
      }

      const result = await API.post('/behavior', body);
      const item = result.item;
      const attrNameMap = {
        physique: '体魄', comprehension: '悟性', willpower: '心性', dexterity: '灵巧', perception: '神识',
      };
      const cv = result.cultivationStatus;
      let toastMsg = `获得 ${item.name}（${item.quality}）+${item.temp_value}临时${attrNameMap[item.attribute_type] || item.attribute_type}`;
      if (cv) {
        toastMsg += ` · ${cv.level}（${cv.activeDays}/7天）`;
      }
      App.toast(toastMsg, 'success');
      this.selectedBehavior = null;

      // V25-007 - 先 await 刷新快捷入口数据，再统一 render 一次（消除双 render 闪烁）
      try {
        const [shortcuts, lastBehavior] = await Promise.all([
          API.get('/behavior/shortcuts'),
          API.get('/behavior/last'),
        ]);
        this.shortcuts = shortcuts;
        this.lastBehavior = lastBehavior;
      } catch (_) {
        // 快捷数据刷新失败不影响主流程
      }

      this.render();
    } catch (e) {
      App.toast(e.message, 'error');
    } finally {
      // V25-006 - 恢复按钮状态
      this.submitting = false;
      const resetBtn = document.getElementById('submit-btn');
      if (resetBtn) {
        resetBtn.disabled = false;
        resetBtn.textContent = '提交';
      }
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
        el.innerHTML = this.renderTabBar() + this.renderHistory(); // V25-038
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
      el.innerHTML = this.renderTabBar() + this.renderHistory(); // V25-038
    }
  },

  // V25-043 - 月历切换时保留旧数据，避免空白闪烁
  navMonth(year, month) {
    this.historyYear = year;
    this.historyMonth = month;
    // V25-043 - 不再置空 historyData，保留旧数据显示
    // this.historyData = null;
    this.selectedDate = null;
    this.render();
    // loadHistory() 完成后会自然替换数据并重新渲染
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
              ${b.intensity ? `· ${e(b.intensity)}` : ''}
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
      // V25-083 - 加载失败时在容器中显示提示
      const el = document.getElementById('behavior-history');
      if (el) {
        el.innerHTML = '<div class="empty-state" style="color:var(--text-dim)">加载失败，请刷新重试</div>';
      }
    }
  },
};
