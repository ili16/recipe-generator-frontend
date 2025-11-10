function toggleMenu() {
  const navContainer = document.querySelector('.nav-links-and-buttons');
  navContainer.classList.toggle('active');
}

async function updateKochbuchLink() {
  try {
      await keycloak.updateToken(30);

      const token = keycloak.token;

      const response = await fetch(`${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/v1/user-info`, {
          method: 'GET',
          headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
          }
      });

      if (!response.ok) {
          throw new Error("Failed to fetch user info");
      }

      const userInfo = await response.json();
      saveUserInfo(userInfo);
  } catch (error) {
      console.error("Error fetching user info:", error);
  }

  const userInfo = JSON.parse(localStorage.getItem("userInfo"));
  const subdomain = userInfo?.subdomain;
  if (subdomain && storageLink) {
    storageLink.href = `https://${subdomain}.z6.web.core.windows.net`;
  }
}

function saveUserInfo(userInfo) {
  localStorage.setItem("userInfo", JSON.stringify(userInfo));
}
