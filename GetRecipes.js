document.addEventListener("DOMContentLoaded", () => {
    const recipeContainer = document.getElementById("recipeContainer");

    // Example array of recipes (replace with API call if needed)
    const recipes = [
        { name: "Spaghetti Bolognese", description: "A classic Italian pasta dish with rich meat sauce." },
        { name: "Chicken Curry", description: "A spicy and flavorful dish with tender chicken pieces." },
        { name: "Vegetable Stir-Fry", description: "A healthy mix of fresh vegetables in a savory sauce." },
    ];

    function displayRecipes() {
        recipes.forEach(recipe => {
            const recipeCard = document.createElement("div");
            recipeCard.classList.add("recipe-card");

            recipeCard.innerHTML = `
                <h2>${recipe.name}</h2>
                <p>${recipe.description}</p>
            `;

            recipeContainer.appendChild(recipeCard);
        });
    }

    displayRecipes();
});

// Language toggle function
function toggleLanguage() {
    const button = document.getElementById("languageToggleButton");
    if (button.innerText === "Switch to English") {
        button.innerText = "Zu Deutsch wechseln";
    } else {
        button.innerText = "Switch to English";
    }
}
