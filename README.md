
# BloomStack

BloomStack is a modern web application for plant recognition, environmental data visualization, and interactive storytelling. Built with React and Vite, it leverages machine learning models for plant identification and provides a rich user experience with maps, charts, and camera integration.

## Features

- **Plant Recognition**: Identify plants using on-device ML models (TFLite) and a simple camera interface.
- **Interactive Map**: Visualize geolocated data points and environmental layers.
- **Charts & Data Visualization**: Explore time series and environmental data with interactive charts.
- **Story Mode**: Engage with educational stories about nature and biodiversity.
- **Feed**: Browse recent activity and discoveries.

## Project Structure

```
projeto/BloomStack/
├── app.js
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.jsx
│   ├── Home.jsx
│   ├── pages/
│   │   ├── About/
│   │   ├── Camera/
│   │   ├── Charts/
│   │   ├── Feed/
│   │   ├── Map/
│   │   ├── Point/
│   │   └── Story/
│   ├── services/
│   └── api/
├── public/
│   └── models/
│       ├── isPlant/
│       └── plantRecogntion/
└── data/
```

## Getting Started

### Prerequisites
- Node.js (v16 or higher recommended)
- npm or yarn

### Installation

1. Clone the repository:
	```bash
	git clone https://github.com/Higor-H/BloomStack.git
	cd BloomStack/projeto/BloomStack
	```
2. Install dependencies:
	```bash
	npm install
	# or
	yarn install
	```
3. Start the development server:
	```bash
	npm run dev
	# or
	yarn dev
	```
4. Open [http://localhost:5173](http://localhost:5173) in your browser.

## Usage
- Use the navigation menu to explore features: Map, Camera, Charts, Feed, Story, and About.
- Try the Camera page to identify plants using your device's camera.
- Explore the Map and Charts for environmental data.

## Machine Learning Models
- TFLite models for plant recognition are located in `public/models/`.
- Labels and model files are included for both plant detection and recognition.

## Folder Overview
- `src/pages/` — Main application pages (Map, Camera, Charts, Feed, Story, About, Point)
- `src/services/` — Service modules for ML, map layers, and storage
- `src/api/` — API integration
- `public/models/` — ML models and label files
- `data/` — Sample datasets

## Contributing
Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.


## Authors
- [Higor-H](https://github.com/Higor-H)
- [Eduardo Zorzan](https://github.com/eduardozorzan)

---

<Original Project> — MIT License
Author: joergmlpts
Repository: https://github.com/joergmlpts/nature-id?tab=MIT-1-ov-file

Usage: Was used the trained model for identifying scientific names of plants.

*BloomStack: Growing knowledge, one plant at a time.*
