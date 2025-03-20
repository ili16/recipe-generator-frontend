document.addEventListener("DOMContentLoaded", function () {
    const recipes = JSON.parse(localStorage.getItem("recipes"));
    if (recipes) {
        displayRecipes(recipes);
    }
});

function displayRecipes(recipes) {
    const recipeContainer = document.getElementById("recipeContainer"); // Ensure this exists in your HTML
    recipeContainer.innerHTML = ""; // Clear existing content

    recipes.forEach(recipe => {
        const recipeCard = document.createElement("div");
        recipeCard.classList.add("recipe-card");

        const recipeDetails = document.createElement("details");
        recipeDetails.classList.add("recipe-details");

        const summary = document.createElement("summary");
        summary.classList.add("recipe-summary");
        summary.innerText = recipe.recipename;

        const content = document.createElement("div");
        content.innerHTML = marked.parse(recipe.recipe); // Convert markdown to HTML

        recipeDetails.appendChild(summary);
        recipeDetails.appendChild(content);
        recipeCard.appendChild(recipeDetails);
        recipeContainer.appendChild(recipeCard);
    });
}

function toggleLanguage() {
    const button = document.getElementById("languageToggleButton");
    button.innerText = button.innerText === "Switch to English" 
        ? "Zu Deutsch wechseln" 
        : "Switch to English";
}
