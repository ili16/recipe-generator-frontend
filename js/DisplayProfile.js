document.addEventListener("DOMContentLoaded", async () => {
    const profileContainer = document.getElementById("profileContainer");

    // Check if the user is logged in and if profile data is in localStorage
    const userEmail = sessionStorage.getItem("userEmail");
    const userId = sessionStorage.getItem("userId");

    if (userEmail && userId) {
        console.log("User Email:", userEmail);
        console.log("User ID:", userId);

        // Create the profile card with user data
        const profileCard = document.createElement("div");
        profileCard.classList.add("profile-card");

        profileCard.innerHTML = `
            <h2>User Profile</h2>
            <div class="profile-info">
                <p><strong>Email:</strong> <span class="user-info">${userEmail}</span></p>
                <p><strong>ID:</strong> <span class="user-info">${userId}</span></p>
            </div>
        `;

        profileContainer.appendChild(profileCard);
    } else {
        console.log("No user profile data found in sessionStorage.");
        await login();  // If not found, trigger the login function to fetch and store the data
    }
});
