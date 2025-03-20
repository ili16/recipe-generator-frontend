async function login() {
    if (sessionStorage.getItem('loggedIn')) {
        console.log('Already logged in during this session.');
        return;
    }

    const response = await fetch(`${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/v1/login`, {
        method: "GET",
        credentials: "include"  // Ensure cookies/auth headers are included
    });

    if (response.ok) {
        console.log("Successfully logged in.");

        const userEmail = response.headers.get("X-USER-NAME");
        const userId = response.headers.get("X-USER-ID");

        if (userEmail && userId) {
            sessionStorage.setItem('userEmail', userEmail);
            sessionStorage.setItem('userId', userId);
            sessionStorage.setItem('loggedIn', 'true');
        }
    } else {
        console.log("Login failed.");
    }
    fetchRecipes();
}

login();
