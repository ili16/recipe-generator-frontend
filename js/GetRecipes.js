async function fetchRecipes() {
    try {
        const response = await fetch(`${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/v1/get-recipes`);
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

function toggleLanguage() {
    const button = document.getElementById("languageToggleButton");
    if (button.innerText === "Switch to English") {
        button.innerText = "Zu Deutsch wechseln";
    } else {
        button.innerText = "Switch to English";
    }
}
