window.keycloak = new Keycloak({
  url: 'https://sso.ili16.de',
  realm: 'recipe-generator',
  clientId: 'frontend',
});

async function login() {
    if (!window.keycloak) {
      console.error("Keycloak is not initialized");
      return;
    }
  
    try {
      await window.keycloak.login();
      const username = window.keycloak.tokenParsed?.name || "User";
  
      // Update navbar
      document.getElementById("usernameDisplay").textContent = username;
      document.getElementById("userDropdown").style.display = "block";
      document.getElementById("loginContainer").style.display = "none";
  
      fetchRecipes();
      updateKochbuchLink();
    } catch (err) {
      console.error("Login failed", err);
    }
  }
  

async function logout() {
    if (!window.keycloak) {
      console.error("Keycloak is not initialized");
      return;
    }
  
    try {
      await window.keycloak.logout();
    } catch (err) {
      console.error("Logout failed", err);
    }
  
    sessionStorage.clear();
    localStorage.clear();
    window.location.reload();
}

window.onload = async function () {
    try {
      const authenticated = await keycloak.init({ onLoad: 'check-sso', pkceMethod: 'S256', silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html' });
      console.log("Keycloak initialized. Authenticated:", authenticated);
  
      if (authenticated) {
        if (!localStorage.getItem('recipes')) {
            console.log("should not be here");
            await fetchRecipes();
            updateKochbuchLink();
        }
      } else {
        document.getElementById("userDropdown").style.display = "none";
        document.getElementById("loginContainer").style.display = "block";
      }
    } catch (error) {
      console.error("Failed to initialize Keycloak", error);
    }
  };
