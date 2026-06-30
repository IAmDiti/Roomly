function layout({ title = 'Roomly', body, showNav = true, user = null }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"/>
  <meta name="mobile-web-app-capable" content="yes"/>
  <meta name="apple-mobile-web-app-capable" content="yes"/>
  <title>${title} · Roomly</title>
  <link rel="stylesheet" href="/css/main.css"/>
</head>
<body>
  ${showNav ? appShell(title, body) : `<main class="main-content">${body}</main>`}
</body>
</html>`;
}

function appShell(title, body) {
  return `
  <div class="app-shell">
    <!-- DESKTOP SIDEBAR -->
    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="sidebar-logo">🏨</span>
        <span class="sidebar-name">Roomly</span>
      </div>
      <nav class="sidebar-nav">
        <a href="/reservations" class="sidebar-link">
          <span class="sidebar-icon">📋</span>
          <span>Reservations</span>
        </a>
        <a href="/availability" class="sidebar-link">
          <span class="sidebar-icon">📅</span>
          <span>Availability</span>
        </a>
        <a href="/rooms" class="sidebar-link">
          <span class="sidebar-icon">🛏</span>
          <span>Room Board</span>
        </a>
        <a href="/admin" class="sidebar-link">
          <span class="sidebar-icon">⚙️</span>
          <span>Admin</span>
        </a>
        <a href="/cleaner" class="sidebar-link">
          <span class="sidebar-icon">🧹</span>
          <span>Cleaner View</span>
        </a>
      </nav>
      <div class="sidebar-footer">
        <a href="/auth/logout" class="sidebar-logout">← Logout</a>
      </div>
    </aside>

    <!-- MAIN AREA -->
    <div class="app-main">
      <!-- MOBILE TOP BAR -->
      <header class="top-bar">
        <div class="top-bar-logo">🏨 Roomly</div>
        <div class="top-bar-title">${title}</div>
        <a href="/auth/logout" class="top-bar-logout">Logout</a>
      </header>

      <!-- DESKTOP TOP BAR -->
      <header class="desktop-topbar">
        <div class="desktop-topbar-title">${title}</div>
      </header>

      <main class="page-body">
        ${body}
      </main>
    </div>
  </div>

  <!-- MOBILE BOTTOM NAV -->
  <nav class="bottom-nav">
    <a href="/reservations" class="bottom-nav-item">
      <span class="bottom-nav-icon">📋</span>
      <span class="bottom-nav-label">Bookings</span>
    </a>
    <a href="/availability" class="bottom-nav-item">
      <span class="bottom-nav-icon">📅</span>
      <span class="bottom-nav-label">Availability</span>
    </a>
    <a href="/rooms" class="bottom-nav-item">
      <span class="bottom-nav-icon">🛏</span>
      <span class="bottom-nav-label">Rooms</span>
    </a>
    <a href="/admin" class="bottom-nav-item">
      <span class="bottom-nav-icon">⚙️</span>
      <span class="bottom-nav-label">Admin</span>
    </a>
    <a href="/cleaner" class="bottom-nav-item">
      <span class="bottom-nav-icon">🧹</span>
      <span class="bottom-nav-label">Cleaner</span>
    </a>
  </nav>`;
}

module.exports = { layout };
