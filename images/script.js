document.addEventListener('DOMContentLoaded', () => {
    // ===========================
    // 1. Header scroll effect
    // ===========================
    const header = document.getElementById('header');
    const backToTopBtn = document.querySelector('.back-to-top');

    window.addEventListener('scroll', () => {
        // Header shadow
        if (window.scrollY > 10) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }

        // Back to top visibility
        if (backToTopBtn) {
            if (window.scrollY > 400) {
                backToTopBtn.classList.add('visible');
            } else {
                backToTopBtn.classList.remove('visible');
            }
        }
    });

    // Back to top click
    if (backToTopBtn) {
        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // ===========================
    // 2. Mobile menu toggle
    // ===========================
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const mobileNav = document.querySelector('.mobile-nav');

    if (mobileMenuBtn && mobileNav) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenuBtn.classList.toggle('active');
            mobileNav.classList.toggle('open');
            document.body.style.overflow = mobileNav.classList.contains('open') ? 'hidden' : '';
        });

        // Close on link click
        mobileNav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                mobileMenuBtn.classList.remove('active');
                mobileNav.classList.remove('open');
                document.body.style.overflow = '';
            });
        });
    }

    // ===========================
    // 3. Category color auto-mapping
    // ===========================
    document.querySelectorAll('.post-item .category, .post-header .category').forEach(el => {
        const text = el.textContent.trim();
        if (text.includes('러닝') || text.includes('코스') || text.includes('running')) {
            el.setAttribute('data-cat', 'running');
        } else if (text.includes('맛집') || text.includes('음식') || text.includes('food')) {
            el.setAttribute('data-cat', 'food');
        } else if (text.includes('리뷰') || text.includes('제품') || text.includes('review')) {
            el.setAttribute('data-cat', 'review');
        }
    });

    // ===========================
    // 4. Card entry animation stagger
    // ===========================
    document.querySelectorAll('.post-item').forEach((item, index) => {
        item.style.animationDelay = `${index * 0.08}s`;
    });

    // ===========================
    // 5. Custom GPX Heatmap Renderer
    // ===========================
    const canvas = document.getElementById('route-canvas');
    const tooltip = document.getElementById('map-tooltip');

    if (canvas && canvas.offsetWidth > 0) {
        const ctx = canvas.getContext('2d');
        
        // Resize canvas to physical pixels for crisp rendering
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        
        const width = rect.width;
        const height = rect.height;

        // Extract skin images path
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
                        
                        let title = file.title;
                        if (!title) {
                            const nameNode = xmlDoc.getElementsByTagName('name')[0];
                            title = nameNode ? nameNode.textContent : "러닝 코스";
                        }

                        const trkpts = xmlDoc.getElementsByTagName('trkpt');
                        const points = [];
                        for (let i = 0; i < trkpts.length; i++) {
                            points.push({
                                lat: parseFloat(trkpts[i].getAttribute('lat')),
                                lon: parseFloat(trkpts[i].getAttribute('lon'))
                            });
                        }
                        return { points, link: file.link, title };
                    })
                    .catch(e => { console.error("Error loading GPX:", e); return null; });
            });
        }

        Promise.all([fetchGeo, Promise.all(gpxPromises)]).then(([geoData, routes]) => {
            // Find bounding box from GPX ROUTES
            let minLat = Infinity, maxLat = -Infinity;
            let minLon = Infinity, maxLon = -Infinity;
            
            const validRoutes = routes.filter(r => r && r.points.length > 0);
            
            if (validRoutes.length > 0) {
                validRoutes.forEach(route => {
                    route.points.forEach(p => {
                        if (p.lat < minLat) minLat = p.lat;
                        if (p.lat > maxLat) maxLat = p.lat;
                        if (p.lon < minLon) minLon = p.lon;
                        if (p.lon > maxLon) maxLon = p.lon;
                    });
                });
            } else {
                minLat = 37.4; maxLat = 37.7;
                minLon = 126.8; maxLon = 127.2;
            }

            // Apply visual padding
            const latDiff = maxLat - minLat || 0.05;
            const lonDiff = maxLon - minLon || 0.05;
            
            const avgLat = (minLat + maxLat) / 2;
            const cosLat = Math.cos(avgLat * Math.PI / 180);
            
            const mapRatio = (lonDiff * cosLat) / latDiff;
            const canvasRatio = width / height;
            
            let drawMinLat = minLat, drawMaxLat = maxLat;
            let drawMinLon = minLon, drawMaxLon = maxLon;

            if (mapRatio > canvasRatio) {
                const newLatDiff = (lonDiff * cosLat) / canvasRatio;
                const latPad = (newLatDiff - latDiff) / 2;
                drawMinLat -= latPad;
                drawMaxLat += latPad;
            } else {
                const newLonDiff = (latDiff * canvasRatio) / cosLat;
                const lonPad = (newLonDiff - lonDiff) / 2;
                drawMinLon -= lonPad;
                drawMaxLon += lonPad;
            }

            const pLat = (drawMaxLat - drawMinLat) * 0.4;
            const pLon = (drawMaxLon - drawMinLon) * 0.4;
            drawMinLat -= pLat; drawMaxLat += pLat;
            drawMinLon -= pLon; drawMaxLon += pLon;

            const getXY = (lat, lon) => {
                const x = ((lon - drawMinLon) / (drawMaxLon - drawMinLon)) * width;
                const y = height - (((lat - drawMinLat) / (drawMaxLat - drawMinLat)) * height);
                return { x, y };
            };

            // Project routes & restaurants
            validRoutes.forEach(route => {
                route.projected = route.points.map(p => getXY(p.lat, p.lon));
            });

            if (window.MAP_DATA.restaurants) {
                window.MAP_DATA.restaurants.forEach(rest => {
                    rest.projected = getXY(rest.lat, rest.lon);
                });
            }

            // ===== Update Map Stats =====
            const statRoutes = document.getElementById('stat-routes');
            const statRestaurants = document.getElementById('stat-restaurants');
            if (statRoutes) statRoutes.textContent = validRoutes.length;
            if (statRestaurants && window.MAP_DATA.restaurants) {
                statRestaurants.textContent = window.MAP_DATA.restaurants.length;
            }

            // ===== DRAW =====
            
            // 1. Background
            const bgGrad = ctx.createLinearGradient(0, 0, width, height);
            bgGrad.addColorStop(0, '#fdfaf6');
            bgGrad.addColorStop(1, '#f5ede0');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, width, height);

            // Subtle dot grid
            ctx.fillStyle = 'rgba(200, 185, 165, 0.25)';
            for (let x = 0; x < width; x += 24) {
                for (let y = 0; y < height; y += 24) {
                    ctx.beginPath();
                    ctx.arc(x, y, 0.8, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // 2. South Korea map outline
            ctx.shadowColor = 'rgba(150, 130, 110, 0.12)';
            ctx.shadowBlur = 18;
            ctx.shadowOffsetX = 3;
            ctx.shadowOffsetY = 6;
            
            const landGradient = ctx.createLinearGradient(0, 0, 0, height);
            landGradient.addColorStop(0, '#f6eed9');
            landGradient.addColorStop(1, '#ece2cc');

            ctx.fillStyle = landGradient;
            ctx.strokeStyle = '#ddd0ba';
            ctx.lineWidth = 1.2;
            
            const drawRings = (rings) => {
                rings.forEach(ring => {
                    ctx.beginPath();
                    ring.forEach((coord, idx) => {
                        const { x, y } = getXY(coord[1], coord[0]);
                        if (idx === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    });
                    ctx.closePath();
                    ctx.fill();
                });
                
                ctx.shadowColor = 'transparent'; 
                rings.forEach(ring => {
                    ctx.beginPath();
                    ring.forEach((coord, idx) => {
                        const { x, y } = getXY(coord[1], coord[0]);
                        if (idx === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    });
                    ctx.closePath();
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

            // Reset shadows
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            // 3. GPX Routes — gradient stroke
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalCompositeOperation = 'source-over';

            validRoutes.forEach(route => {
                if (route.projected.length < 2) return;

                // Glow effect
                ctx.save();
                ctx.shadowColor = 'rgba(255, 107, 74, 0.5)';
                ctx.shadowBlur = 12;
                ctx.lineWidth = 5;
                ctx.strokeStyle = 'rgba(255, 107, 74, 0.35)';
                ctx.beginPath();
                route.projected.forEach((p, idx) => {
                    if (idx === 0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                });
                ctx.stroke();
                ctx.restore();

                // Main line with gradient
                const startP = route.projected[0];
                const endP = route.projected[route.projected.length - 1];
                const grad = ctx.createLinearGradient(startP.x, startP.y, endP.x, endP.y);
                grad.addColorStop(0, '#ff6b4a');
                grad.addColorStop(1, '#ff9a76');

                ctx.lineWidth = 3.5;
                ctx.strokeStyle = grad;
                ctx.beginPath();
                route.projected.forEach((p, idx) => {
                    if (idx === 0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                });
                ctx.stroke();

                // Start/end dots
                ctx.beginPath();
                ctx.arc(startP.x, startP.y, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#ff6b4a';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
            });

            // 4. Restaurant Pins — modern style
            const drawPin = (x, y) => {
                // Pin shadow
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.15)';
                ctx.shadowBlur = 6;
                ctx.shadowOffsetY = 3;

                // Pin body
                ctx.beginPath();
                ctx.arc(x, y - 12, 9, Math.PI, 0, false);
                ctx.lineTo(x, y + 2);
                ctx.closePath();
                
                const pinGrad = ctx.createLinearGradient(x, y - 21, x, y + 2);
                pinGrad.addColorStop(0, '#ff9a76');
                pinGrad.addColorStop(1, '#ff6b4a');
                ctx.fillStyle = pinGrad;
                ctx.fill();
                
                ctx.restore();

                // White border
                ctx.beginPath();
                ctx.arc(x, y - 12, 9, Math.PI, 0, false);
                ctx.lineTo(x, y + 2);
                ctx.closePath();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Inner circle
                ctx.beginPath();
                ctx.arc(x, y - 12, 3.5, 0, Math.PI * 2);
                ctx.fillStyle = '#fff';
                ctx.fill();
            };

            if (window.MAP_DATA.restaurants) {
                window.MAP_DATA.restaurants.forEach(rest => {
                    if (rest.projected) drawPin(rest.projected.x, rest.projected.y);
                });
            }

            // ===== INTERACTION =====
            function dist2(v, w) { return Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2); }
            function distToSegmentSquared(p, v, w) {
                let l2 = dist2(v, w);
                if (l2 === 0) return dist2(p, v);
                let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
                t = Math.max(0, Math.min(1, t));
                return dist2(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
            }

            const getHit = (mx, my) => {
                const mousePt = { x: mx, y: my };
                
                // Check restaurants first
                if (window.MAP_DATA.restaurants) {
                    for (let rest of window.MAP_DATA.restaurants) {
                        if (rest.projected && dist2(mousePt, {x: rest.projected.x, y: rest.projected.y - 8}) < 200) {
                            return { type: 'restaurant', data: rest };
                        }
                    }
                }
                
                // Check routes
                const HIT_RADIUS_SQ = 100;
                for (let route of validRoutes) {
                    for (let i = 0; i < route.projected.length - 1; i++) {
                        let d2 = distToSegmentSquared(mousePt, route.projected[i], route.projected[i+1]);
                        if (d2 < HIT_RADIUS_SQ) {
                            return { type: 'route', data: route };
                        }
                    }
                }
                return null;
            };

            let hoveredItem = null;

            canvas.addEventListener('mousemove', (e) => {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                const hit = getHit(x, y);
                if (hit) {
                    canvas.style.cursor = 'pointer';
                    hoveredItem = hit;
                    tooltip.style.display = 'block';
                    tooltip.style.opacity = '1';
                    tooltip.style.left = x + 'px';
                    tooltip.style.top = y + 'px';
                    tooltip.textContent = hit.type === 'restaurant' ? `🍽️ ${hit.data.title}` : `🏃 ${hit.data.title}`;
                } else {
                    canvas.style.cursor = 'grab';
                    hoveredItem = null;
                    tooltip.style.display = 'none';
                    tooltip.style.opacity = '0';
                }
            });

            canvas.addEventListener('click', () => {
                if (hoveredItem && hoveredItem.data.link) {
                    window.location.href = hoveredItem.data.link;
                } else if (hoveredItem && hoveredItem.data.url) {
                    window.location.href = hoveredItem.data.url;
                }
            });
            
            canvas.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none';
                tooltip.style.opacity = '0';
                hoveredItem = null;
            });
        });
    }

    // ===========================
    // 6. Nearby Restaurants Widget
    // ===========================
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
                        directLink.innerHTML = `🍽️ ${rest.title}`;
                        listContainer.appendChild(directLink);
                    }
                });
            }

            postContent.appendChild(widget);
        }
    }
});
