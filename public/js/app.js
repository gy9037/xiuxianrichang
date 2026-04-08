const App = {
  currentPage: null,

  init() {
    if (!API.isLoggedIn()) {
      this.showLogin();
    } else {
      this.showApp();
      this.navigate('home');
    }
  },

  showLogin() {
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('bottom-nav').style.display = 'none';
    LoginPage.init();
  },

  showApp() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    document.getElementById('bottom-nav').style.display = 'flex';
  },

  navigate(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const pageEl = document.getElementById(`page-${page}`);
    const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);

    if (pageEl) pageEl.classList.add('active');
    if (navEl) navEl.classList.add('active');

    this.currentPage = page;

    // Load page data
    switch (page) {
      case 'home': HomePage.load(); break;
      case 'behavior': BehaviorPage.load(); break;
      case 'inventory': InventoryPage.load(); break;
      case 'wish': WishPage.load(); break;
      case 'family': FamilyPage.load(); break;
    }
  },

  toast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  },
};

// Nav click handlers
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      App.navigate(item.dataset.page);
    });
  });
  App.init();
});
