# ExoBoostX Weather

ExoBoostX Weather is a responsive static weather web app built to work well on phones and desktop browsers.

## Features

- Search locations with live geocoding
- Load current weather plus 24-hour and 7-day forecasts
- Save favorite places locally in the browser
- Toggle between Celsius and Fahrenheit
- Use browser geolocation when available
- Mobile-first glassy weather UI
- PWA manifest, icons, and service worker for installable hosting

## Data source

- Open-Meteo forecast API
- Open-Meteo geocoding API

## Run locally

Open `index.html` in a browser.

## Best way to use on iPhone

Host these files on a static site such as GitHub Pages, Netlify, or Vercel, then open that URL on your iPhone and add it to the home screen.

## GitHub Pages setup

1. Create a new GitHub repository.
2. Upload everything in this folder to the root of that repository.
3. Push to the `main` branch.
4. In GitHub, open `Settings -> Pages`.
5. Under `Build and deployment`, set `Source` to `GitHub Actions`.
6. Wait for the `Deploy ExoBoostX Weather` workflow to finish.
7. Open the Pages URL GitHub gives you on your iPhone in Safari.
8. Tap `Share -> Add to Home Screen`.

## Notes

- Saved places are stored in browser local storage
- On some browsers, geolocation may require HTTPS instead of a local file
- Saved places can be loaded or removed directly from the saved list
- Service worker install and offline shell caching activate when hosted over HTTP(S), not from a local `file://` URL
- `.nojekyll` is included so GitHub Pages serves the site as plain static files
