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
    if (canvas && document.body.id === 'tt-body-index') {
        const ctx = canvas.getContext('2d');
        
        // Resize canvas to physical pixels for crisp rendering
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        
        const width = rect.width;
        const height = rect.height;

        // Extract skin images path from script tag
        let skinImagesPath = '';
        const scripts = document.getElementsByTagName('script');
        for (let s of scripts) {
            if (s.src.includes('script.js')) {
                skinImagesPath = s.src.split('script.js')[0];
                break;
            }
        }

        // Fetch and parse all GPX files
        if (window.MAP_DATA && window.MAP_DATA.gpxFiles) {
            Promise.all(window.MAP_DATA.gpxFiles.map(file => {
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
                    .catch(e => { console.error("Error loading GPX:", e); return null; })
            })).then(routes => {
                const validRoutes = routes.filter(r => r && r.points.length > 0);
                if (validRoutes.length === 0) return;

                // Find global bounding box
                let minLat = Infinity, maxLat = -Infinity;
                let minLon = Infinity, maxLon = -Infinity;
                
                validRoutes.forEach(route => {
                    route.points.forEach(p => {
                        if (p.lat < minLat) minLat = p.lat;
                        if (p.lat > maxLat) maxLat = p.lat;
                        if (p.lon < minLon) minLon = p.lon;
                        if (p.lon > maxLon) maxLon = p.lon;
                    });
                });

                // Add padding (10%)
                const latDiff = maxLat - minLat || 0.01;
                const lonDiff = maxLon - minLon || 0.01;
                minLat -= latDiff * 0.1;
                maxLat += latDiff * 0.1;
                minLon -= lonDiff * 0.1;
                maxLon += lonDiff * 0.1;

                // Helper to map lat/lon to canvas x/y
                const getXY = (lat, lon) => {
                    const x = ((lon - minLon) / (maxLon - minLon)) * width;
                    const y = height - (((lat - minLat) / (maxLat - minLat)) * height); // Invert Y
                    return { x, y };
                };

                // Draw configuration
                ctx.lineWidth = 4;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.strokeStyle = 'rgba(255, 126, 103, 0.6)'; // Soft coral with opacity for heatmap effect
                ctx.globalCompositeOperation = 'multiply';

                // Draw each route
                validRoutes.forEach(route => {
                    ctx.beginPath();
                    route.points.forEach((p, idx) => {
                        const { x, y } = getXY(p.lat, p.lon);
                        if (idx === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    });
                    ctx.stroke();
                });

                // Draw Restaurants
                if (window.MAP_DATA.restaurants) {
                    ctx.globalCompositeOperation = 'source-over'; // Reset blend mode for icons
                    ctx.font = '24px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    window.MAP_DATA.restaurants.forEach(rest => {
                        // Only draw if within bounds
                        if (rest.lat >= minLat && rest.lat <= maxLat && rest.lon >= minLon && rest.lon <= maxLon) {
                            const { x, y } = getXY(rest.lat, rest.lon);
                            ctx.fillText('🍔', x, y);
                        }
                    });
                }
            });
        }
    }

    // 3. Nearby Restaurants Widget (Tag based link)
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
