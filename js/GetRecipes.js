async function fetchRecipes() {
    try {
        // Refresh token if it's about to expire
        await keycloak.updateToken(5); // refresh if token will expire in next 5 seconds

        const token = keycloak.token;

        const response = await fetch(`${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/v1/get-recipes`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error("Failed to fetch recipes");
        }

        const recipes = await response.json();
        saveRecipes(recipes);
    } catch (error) {
        console.error("Error fetching recipes:", error);
    }
}


function saveRecipes(recipes) {
    localStorage.setItem("recipes", JSON.stringify(recipes));
}
