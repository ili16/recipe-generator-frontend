async function login() {
    if (sessionStorage.getItem('loggedIn')) {
        console.log('Already logged in during this session.');
        return;
    }

    const response = await fetch(`${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/v1/login`, {
        method: "GET"
    });

    if (response.ok) {
        console.log("Successfully logged in.");
        sessionStorage.setItem('loggedIn', 'true');
    } else {
        console.log("Login failed.");
    }
}

login();
