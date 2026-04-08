const LoginPage = {
  isRegister: false,

  init() {
    this.render();
  },

  render() {
    const container = document.getElementById('login-page');
    container.innerHTML = `
      <div class="login-container">
        <div class="login-title">修仙日常</div>
        <div class="login-subtitle">以行动修行，以愿望破境</div>
        <div class="login-form">
          ${this.isRegister ? `
            <div class="form-group">
              <label>昵称</label>
              <input type="text" id="reg-name" placeholder="你的修仙道号">
            </div>
          ` : ''}
          <div class="form-group">
            <label>用户名</label>
            <input type="text" id="login-username" placeholder="输入用户名" autocapitalize="off">
          </div>
          <div class="form-group">
            <label>密码</label>
            <input type="password" id="login-password" placeholder="输入密码">
          </div>
          <button class="btn btn-primary" onclick="LoginPage.submit()">
            ${this.isRegister ? '注册' : '登录'}
          </button>
          <div class="login-toggle" onclick="LoginPage.toggle()">
            ${this.isRegister ? '已有账号？去登录' : '没有账号？去注册'}
          </div>
        </div>
      </div>
    `;
  },

  toggle() {
    this.isRegister = !this.isRegister;
    this.render();
  },

  async submit() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (!username || !password) {
      App.toast('请填写用户名和密码', 'error');
      return;
    }

    try {
      if (this.isRegister) {
        const name = document.getElementById('reg-name').value.trim();
        if (!name) { App.toast('请填写昵称', 'error'); return; }
        const data = await API.post('/auth/register', { username, password, name });
        API.setAuth(data.token, data.user);
        App.toast('注册成功，欢迎入道！', 'success');
      } else {
        const data = await API.post('/auth/login', { username, password });
        API.setAuth(data.token, data.user);
        App.toast(`欢迎回来，${data.user.name}`, 'success');
      }
      App.showApp();
      App.navigate('home');
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },
};
