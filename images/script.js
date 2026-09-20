document.addEventListener('DOMContentLoaded', () => {
    // 1. Header shadow on scroll
    const header = document.getElementById('header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 10) {
            header.style.boxShadow = '0 2px 10px rgba(0,0,0,0.05)';
        } else {
            header.style.boxShadow = 'none';
        }
    });

    // 2. Custom GPX Heatmap Renderer
    const canvas = document.getElementById('route-canvas');
    if (canvas && canvas.offsetWidth > 0) {
        const ctx = canvas.getContext('2d');
        
        // Resize canvas to physical pixels for crisp rendering
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        
        const width = rect.width;
        const height = rect.height;

        // Extract skin images path safely using the script tag processed by Tistory
        let skinImagesPath = '';
        const helperScript = document.getElementById('skin-path-helper');
        if (helperScript && helperScript.src) {
            skinImagesPath = helperScript.src.split('script.js')[0];
        }

        // Fetch Korea GeoJSON and GPX files
        const fetchGeo = fetch(skinImagesPath + 'korea.json').then(res => res.json());
        
        let gpxPromises = [];
        if (window.MAP_DATA && window.MAP_DATA.gpxFiles) {
            gpxPromises = window.MAP_DATA.gpxFiles.map(file => {
                const fetchUrl = file.url || (skinImagesPath + file.filename);
                return fetch(fetchUrl)
                    .then(res => res.text())
                    .then(xmlString => {
                        const parser = new DOMParser();
                        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
                        const trkpts = xmlDoc.getElementsByTagName('trkpt');
                        const points = [];
                        for (let i = 0; i < trkpts.length; i++) {
                            points.push({
                                lat: parseFloat(trkpts[i].getAttribute('lat')),
                                lon: parseFloat(trkpts[i].getAttribute('lon'))
                            });
                        }
                        return { points, link: file.link };
                    })
                    .catch(e => { console.error("Error loading GPX:", e); return null; });
            });
        }

        Promise.all([fetchGeo, Promise.all(gpxPromises)]).then(([geoData, routes]) => {
            // Find global bounding box from GeoJSON
            let minLat = Infinity, maxLat = -Infinity;
            let minLon = Infinity, maxLon = -Infinity;
            
            const processCoord = (coord) => {
                const lon = coord[0], lat = coord[1];
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
                if (lon < minLon) minLon = lon;
                if (lon > maxLon) maxLon = lon;
            };

            geoData.features.forEach(feature => {
                if (feature.geometry.type === 'Polygon') {
                    feature.geometry.coordinates.forEach(ring => ring.forEach(processCoord));
                } else if (feature.geometry.type === 'MultiPolygon') {
                    feature.geometry.coordinates.forEach(poly => poly.forEach(ring => ring.forEach(processCoord)));
                }
            });

            // Add padding (5%)
            const latDiff = maxLat - minLat || 0.01;
            const lonDiff = maxLon - minLon || 0.01;
            
            // Adjust aspect ratio based on average latitude (Mercator-ish approximation)
            const avgLat = (minLat + maxLat) / 2;
            const cosLat = Math.cos(avgLat * Math.PI / 180);
            
            // We want the logical box to fit inside the physical canvas
            const mapRatio = (lonDiff * cosLat) / latDiff;
            const canvasRatio = width / height;
            
            let drawMinLat = minLat, drawMaxLat = maxLat;
            let drawMinLon = minLon, drawMaxLon = maxLon;

            if (mapRatio > canvasRatio) {
                // Map is wider than canvas, add vertical padding
                const newLatDiff = (lonDiff * cosLat) / canvasRatio;
                const latPad = (newLatDiff - latDiff) / 2;
                drawMinLat -= latPad;
                drawMaxLat += latPad;
            } else {
                // Map is taller than canvas, add horizontal padding
                const newLonDiff = (latDiff * canvasRatio) / cosLat;
                const lonPad = (newLonDiff - lonDiff) / 2;
                drawMinLon -= lonPad;
                drawMaxLon += lonPad;
            }

            // Apply 5% visual padding
            const pLat = (drawMaxLat - drawMinLat) * 0.05;
            const pLon = (drawMaxLon - drawMinLon) * 0.05;
            drawMinLat -= pLat; drawMaxLat += pLat;
            drawMinLon -= pLon; drawMaxLon += pLon;

            const getXY = (lat, lon) => {
                const x = ((lon - drawMinLon) / (drawMaxLon - drawMinLon)) * width;
                const y = height - (((lat - drawMinLat) / (drawMaxLat - drawMinLat)) * height);
                return { x, y };
            };

            // 1. Draw Map Outline (South Korea)
            ctx.fillStyle = '#f0e6d2'; // Warm land color
            ctx.strokeStyle = '#dfd3c0';
            ctx.lineWidth = 1;
            
            const drawRings = (rings) => {
                rings.forEach(ring => {
                    ctx.beginPath();
                    ring.forEach((coord, idx) => {
                        const { x, y } = getXY(coord[1], coord[0]); // GeoJSON is [lon, lat]
                        if (idx === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    });
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                });
            };

            geoData.features.forEach(feature => {
                if (feature.geometry.type === 'Polygon') {
                    drawRings(feature.geometry.coordinates);
                } else if (feature.geometry.type === 'MultiPolygon') {
                    feature.geometry.coordinates.forEach(poly => drawRings(poly));
                }
            });

            // 2. Draw GPX Routes
            const validRoutes = routes.filter(r => r && r.points.length > 0);
            
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = 'rgba(255, 126, 103, 0.8)'; 
            ctx.globalCompositeOperation = 'multiply';

            validRoutes.forEach(route => {
                ctx.beginPath();
                route.points.forEach((p, idx) => {
                    const { x, y } = getXY(p.lat, p.lon);
                    if (idx === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                });
                ctx.stroke();
            });

            // 3. Draw Restaurants
            if (window.MAP_DATA.restaurants) {
                ctx.globalCompositeOperation = 'source-over';
                ctx.font = '24px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                window.MAP_DATA.restaurants.forEach(rest => {
                    const { x, y } = getXY(rest.lat, rest.lon);
                    ctx.fillText('🍔', x, y);
                });
            }
        });
    }

    // 3. Nearby Restaurants Widget
    const isPostPage = document.body.id === 'tt-body-page';
    const categoryEl = document.querySelector('.post-header .category');
    
    if (isPostPage && categoryEl && categoryEl.textContent.includes('러닝코스')) {
        const tagEls = document.querySelectorAll('.post-tags a');
        if (tagEls.length > 0) {
            const locationTag = tagEls[0].textContent.replace('#', '').trim();
            const postContent = document.querySelector('.post-content');
            
            const widget = document.createElement('div');
            widget.className = 'nearby-restaurants';
            widget.innerHTML = `<h3>🏃 '${locationTag}' 근처 추천 맛집</h3><div class="nearby-list"></div>`;
            
            const listContainer = widget.querySelector('.nearby-list');
            const searchLink = document.createElement('a');
            searchLink.className = 'nearby-item';
            searchLink.href = `/search/${encodeURIComponent(locationTag + " 맛집")}`;
            searchLink.innerHTML = `🍽️ <strong>${locationTag}</strong> 맛집 검색 결과 보기`;
            listContainer.appendChild(searchLink);
            
            if (window.MAP_DATA && window.MAP_DATA.restaurants) {
                window.MAP_DATA.restaurants.forEach(rest => {
                    if (rest.title.includes(locationTag)) {
                        const directLink = document.createElement('a');
                        directLink.className = 'nearby-item';
                        directLink.href = rest.url;
                        directLink.innerHTML = `🍔 ${rest.title}`;
                        listContainer.appendChild(directLink);
                    }
                });
            }

            postContent.appendChild(widget);
        }
    }
});
