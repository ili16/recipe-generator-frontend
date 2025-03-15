document.addEventListener("DOMContentLoaded", function () {
    const recipes = JSON.parse(localStorage.getItem("recipes"));
    if (recipes) {
        displayRecipes(recipes);
    }
}
);

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

function toggleLanguage() {
    const button = document.getElementById("languageToggleButton");
    if (button.innerText === "Switch to English") {
        button.innerText = "Zu Deutsch wechseln";
    } else {
        button.innerText = "Switch to English";
    }
}
