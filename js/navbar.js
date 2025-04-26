// Dynamically set the Kochbuch link in the navbar based on sessionStorage
function updateKochbuchLink() {
  const storageAccountName = sessionStorage.getItem('storageAccountName');
  const storageLink = document.getElementById('storageLink');
  if (storageAccountName && storageLink) {
    storageLink.href = `https://${storageAccountName}.z6.web.core.windows.net`;
  }
}

// Call this function on DOMContentLoaded to set the initial link
window.addEventListener('DOMContentLoaded', updateKochbuchLink);

function toggleMenu() {
  const navContainer = document.querySelector('.nav-links-and-buttons');
  navContainer.classList.toggle('active');
}
