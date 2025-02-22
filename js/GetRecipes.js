document.addEventListener("DOMContentLoaded", () => {
    const recipeContainer = document.getElementById("recipeContainer");

    async function fetchRecipes() {
        try {
            const response = await fetch(`${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/v1/get-recipes`);
            if (!response.ok) {
                throw new Error("Failed to fetch recipes");
            }
            const recipes = await response.json();
            displayRecipes(recipes);
        } catch (error) {
            console.error("Error fetching recipes:", error);
        }
    }

    function displayRecipes(recipes) {
        recipes.forEach(recipe => {
            const recipeCard = document.createElement("div");
            recipeCard.classList.add("recipe-card");

            recipeCard.innerHTML = `
                <details class="recipe-details">
                    <summary class="recipe-summary">${recipe.recipename}</summary>
                    <p>${recipe.recipe}</p>
                </details>
            `;

            recipeContainer.appendChild(recipeCard);
        });
    }

    fetchRecipes();
});

function toggleLanguage() {
    const button = document.getElementById("languageToggleButton");
    if (button.innerText === "Switch to English") {
        button.innerText = "Zu Deutsch wechseln";
    } else {
        button.innerText = "Switch to English";
    }
}
