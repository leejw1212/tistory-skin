document.addEventListener('DOMContentLoaded', () => {
    // ===========================
    // 1. Header scroll effect
    // ===========================
    const header = document.getElementById('header');
    const backToTopBtn = document.querySelector('.back-to-top');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 10) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
        if (backToTopBtn) {
            if (window.scrollY > 400) {
                backToTopBtn.classList.add('visible');
            } else {
                backToTopBtn.classList.remove('visible');
            }
        }
    });

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
    // 5. Interactive Map — Zoom / Pan / Region
    // ===========================
    const canvas = document.getElementById('route-canvas');
    const tooltip = document.getElementById('map-tooltip');

    if (canvas && canvas.offsetWidth > 0) {
        const ctx = canvas.getContext('2d');

        const containerRect = canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = containerRect.width * dpr;
        canvas.height = containerRect.height * dpr;
        ctx.scale(dpr, dpr);

        const W = containerRect.width;
        const H = containerRect.height;

        // Skin images path
        let skinImagesPath = '';
        const helperScript = document.getElementById('skin-path-helper');
        if (helperScript && helperScript.src) {
            skinImagesPath = helperScript.src.split('script.js')[0];
        }

        // Region presets (lat/lon bounds)
        const REGIONS = {
            all:      null, // auto-fit to routes
            seoul:    { minLat: 37.42, maxLat: 37.70, minLon: 126.80, maxLon: 127.15 },
            gyeonggi: { minLat: 36.90, maxLat: 38.00, minLon: 126.40, maxLon: 127.80 },
            incheon:  { minLat: 37.30, maxLat: 37.60, minLon: 126.35, maxLon: 126.80 },
            busan:    { minLat: 35.05, maxLat: 35.25, minLon: 128.90, maxLon: 129.20 },
            daegu:    { minLat: 35.80, maxLat: 35.95, minLon: 128.50, maxLon: 128.75 },
            gwangju:  { minLat: 35.10, maxLat: 35.25, minLon: 126.80, maxLon: 127.00 },
            daejeon:  { minLat: 36.28, maxLat: 36.42, minLon: 127.30, maxLon: 127.50 },
            jeju:     { minLat: 33.20, maxLat: 33.60, minLon: 126.15, maxLon: 126.95 }
        };

        // Fetch data
        const fetchGeo = fetch(skinImagesPath + 'korea.json').then(r => r.json());
        let gpxPromises = [];
        if (window.MAP_DATA && window.MAP_DATA.gpxFiles) {
            gpxPromises = window.MAP_DATA.gpxFiles.map(file => {
                const fetchUrl = file.url || (skinImagesPath + file.filename);
                return fetch(fetchUrl)
                    .then(r => r.text())
                    .then(xml => {
                        const doc = new DOMParser().parseFromString(xml, 'text/xml');
                        let title = file.title;
                        if (!title) {
                            const n = doc.getElementsByTagName('name')[0];
                            title = n ? n.textContent : '러닝 코스';
                        }
                        const pts = doc.getElementsByTagName('trkpt');
                        const points = [];
                        for (let i = 0; i < pts.length; i++) {
                            points.push({
                                lat: parseFloat(pts[i].getAttribute('lat')),
                                lon: parseFloat(pts[i].getAttribute('lon'))
                            });
                        }
                        return { points, link: file.link, title };
                    })
                    .catch(() => null);
            });
        }

        Promise.all([fetchGeo, Promise.all(gpxPromises)]).then(([geoData, routes]) => {
            const validRoutes = routes.filter(r => r && r.points.length > 0);

            // Compute route bounds
            let rMinLat = Infinity, rMaxLat = -Infinity;
            let rMinLon = Infinity, rMaxLon = -Infinity;
            if (validRoutes.length > 0) {
                validRoutes.forEach(route => {
                    route.points.forEach(p => {
                        if (p.lat < rMinLat) rMinLat = p.lat;
                        if (p.lat > rMaxLat) rMaxLat = p.lat;
                        if (p.lon < rMinLon) rMinLon = p.lon;
                        if (p.lon > rMaxLon) rMaxLon = p.lon;
                    });
                });
            } else {
                rMinLat = 37.4; rMaxLat = 37.7;
                rMinLon = 126.8; rMaxLon = 127.2;
            }

            // ──── Viewport state ────
            let viewport = { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 };

            function fitBounds(minLat, maxLat, minLon, maxLon, padding) {
                padding = padding || 0.4;
                const latD = maxLat - minLat || 0.05;
                const lonD = maxLon - minLon || 0.05;
                const avgLat = (minLat + maxLat) / 2;
                const cosLat = Math.cos(avgLat * Math.PI / 180);

                const mapR = (lonD * cosLat) / latD;
                const canR = W / H;

                let dMinLat = minLat, dMaxLat = maxLat;
                let dMinLon = minLon, dMaxLon = maxLon;

                if (mapR > canR) {
                    const nd = (lonD * cosLat) / canR;
                    const pad = (nd - latD) / 2;
                    dMinLat -= pad; dMaxLat += pad;
                } else {
                    const nd = (latD * canR) / cosLat;
                    const pad = (nd - lonD) / 2;
                    dMinLon -= pad; dMaxLon += pad;
                }

                const pLat = (dMaxLat - dMinLat) * padding;
                const pLon = (dMaxLon - dMinLon) * padding;
                viewport.minLat = dMinLat - pLat;
                viewport.maxLat = dMaxLat + pLat;
                viewport.minLon = dMinLon - pLon;
                viewport.maxLon = dMaxLon + pLon;
            }

            // Initial fit
            fitBounds(rMinLat, rMaxLat, rMinLon, rMaxLon, 0.4);

            const initialViewport = { ...viewport };

            // ──── Projection ────
            function getXY(lat, lon) {
                const x = ((lon - viewport.minLon) / (viewport.maxLon - viewport.minLon)) * W;
                const y = H - (((lat - viewport.minLat) / (viewport.maxLat - viewport.minLat)) * H);
                return { x, y };
            }

            function getLatLon(x, y) {
                const lon = viewport.minLon + (x / W) * (viewport.maxLon - viewport.minLon);
                const lat = viewport.minLat + ((H - y) / H) * (viewport.maxLat - viewport.minLat);
                return { lat, lon };
            }

            // ──── Render function ────
            function render() {
                // Re-project
                validRoutes.forEach(route => {
                    route.projected = route.points.map(p => getXY(p.lat, p.lon));
                });
                if (window.MAP_DATA.restaurants) {
                    window.MAP_DATA.restaurants.forEach(rest => {
                        rest.projected = getXY(rest.lat, rest.lon);
                    });
                }

                // Clear
                ctx.clearRect(0, 0, W, H);

                // 1. Background
                const bgGrad = ctx.createLinearGradient(0, 0, W, H);
                bgGrad.addColorStop(0, '#fdfaf6');
                bgGrad.addColorStop(1, '#f5ede0');
                ctx.fillStyle = bgGrad;
                ctx.fillRect(0, 0, W, H);

                // Dot grid
                ctx.fillStyle = 'rgba(200, 185, 165, 0.25)';
                for (let gx = 0; gx < W; gx += 24) {
                    for (let gy = 0; gy < H; gy += 24) {
                        ctx.beginPath();
                        ctx.arc(gx, gy, 0.8, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }

                // 2. Korea outline
                ctx.save();
                ctx.shadowColor = 'rgba(150, 130, 110, 0.12)';
                ctx.shadowBlur = 18;
                ctx.shadowOffsetX = 3;
                ctx.shadowOffsetY = 6;

                const landGrad = ctx.createLinearGradient(0, 0, 0, H);
                landGrad.addColorStop(0, '#f6eed9');
                landGrad.addColorStop(1, '#ece2cc');

                ctx.fillStyle = landGrad;
                ctx.strokeStyle = '#ddd0ba';
                ctx.lineWidth = 1.2;

                const drawRings = (rings) => {
                    rings.forEach(ring => {
                        ctx.beginPath();
                        ring.forEach((c, i) => {
                            const p = getXY(c[1], c[0]);
                            i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
                        });
                        ctx.closePath();
                        ctx.fill();
                    });
                    ctx.shadowColor = 'transparent';
                    rings.forEach(ring => {
                        ctx.beginPath();
                        ring.forEach((c, i) => {
                            const p = getXY(c[1], c[0]);
                            i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
                        });
                        ctx.closePath();
                        ctx.stroke();
                    });
                };

                geoData.features.forEach(f => {
                    if (f.geometry.type === 'Polygon') drawRings(f.geometry.coordinates);
                    else if (f.geometry.type === 'MultiPolygon') f.geometry.coordinates.forEach(p => drawRings(p));
                });
                ctx.restore();

                // 3. GPX Routes
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                validRoutes.forEach(route => {
                    if (route.projected.length < 2) return;
                    // Glow
                    ctx.save();
                    ctx.shadowColor = 'rgba(255, 107, 74, 0.5)';
                    ctx.shadowBlur = 12;
                    ctx.lineWidth = 5;
                    ctx.strokeStyle = 'rgba(255, 107, 74, 0.35)';
                    ctx.beginPath();
                    route.projected.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
                    ctx.stroke();
                    ctx.restore();

                    // Main gradient line
                    const s = route.projected[0], e = route.projected[route.projected.length - 1];
                    const grad = ctx.createLinearGradient(s.x, s.y, e.x, e.y);
                    grad.addColorStop(0, '#ff6b4a');
                    grad.addColorStop(1, '#ff9a76');
                    ctx.lineWidth = 3.5;
                    ctx.strokeStyle = grad;
                    ctx.beginPath();
                    route.projected.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
                    ctx.stroke();

                    // Start dot
                    ctx.beginPath();
                    ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
                    ctx.fillStyle = '#ff6b4a';
                    ctx.fill();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                });

                // 4. Restaurant Pins
                const drawPin = (x, y) => {
                    ctx.save();
                    ctx.shadowColor = 'rgba(0,0,0,0.15)';
                    ctx.shadowBlur = 6;
                    ctx.shadowOffsetY = 3;
                    ctx.beginPath();
                    ctx.arc(x, y - 12, 9, Math.PI, 0, false);
                    ctx.lineTo(x, y + 2);
                    ctx.closePath();
                    const pg = ctx.createLinearGradient(x, y - 21, x, y + 2);
                    pg.addColorStop(0, '#ff9a76');
                    pg.addColorStop(1, '#ff6b4a');
                    ctx.fillStyle = pg;
                    ctx.fill();
                    ctx.restore();

                    ctx.beginPath();
                    ctx.arc(x, y - 12, 9, Math.PI, 0, false);
                    ctx.lineTo(x, y + 2);
                    ctx.closePath();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.arc(x, y - 12, 3.5, 0, Math.PI * 2);
                    ctx.fillStyle = '#fff';
                    ctx.fill();
                };

                if (window.MAP_DATA.restaurants) {
                    window.MAP_DATA.restaurants.forEach(r => {
                        if (r.projected) drawPin(r.projected.x, r.projected.y);
                    });
                }
            }

            // Update stats & dropdowns
            const elRoutes = document.getElementById('stat-routes');
            const elRest = document.getElementById('stat-restaurants');
            if (elRoutes) elRoutes.textContent = validRoutes.length;
            if (elRest && window.MAP_DATA.restaurants) elRest.textContent = window.MAP_DATA.restaurants.length;

            const dropdownRoutes = document.getElementById('dropdown-routes');
            const dropdownRest = document.getElementById('dropdown-restaurants');

            if (dropdownRoutes) {
                dropdownRoutes.innerHTML = validRoutes.map((r, i) => 
                    `<button class="stat-item" data-idx="${i}">📍 ${r.title}</button>`
                ).join('');
            }
            if (dropdownRest && window.MAP_DATA.restaurants) {
                dropdownRest.innerHTML = window.MAP_DATA.restaurants.map((r, i) => 
                    `<button class="stat-item" data-idx="${i}">🍽️ ${r.title}</button>`
                ).join('');
            }

            // Region counts
            const regionCounts = {};
            Object.keys(REGIONS).forEach(key => {
                if (key === 'all') return;
                let count = 0;
                const b = REGIONS[key];
                validRoutes.forEach(r => {
                    if (r.points.some(p => p.lat >= b.minLat && p.lat <= b.maxLat && p.lon >= b.minLon && p.lon <= b.maxLon)) count++;
                });
                if (window.MAP_DATA.restaurants) {
                    window.MAP_DATA.restaurants.forEach(r => {
                        if (r.lat >= b.minLat && r.lat <= b.maxLat && r.lon >= b.minLon && r.lon <= b.maxLon) count++;
                    });
                }
                regionCounts[key] = count;
            });

            document.querySelectorAll('.map-region-item').forEach(btn => {
                const key = btn.dataset.region;
                if (key !== 'all' && regionCounts[key] !== undefined && regionCounts[key] > 0) {
                    btn.innerHTML += ` <span class="region-count">(${regionCounts[key]})</span>`;
                }
            });

            // Initial render
            render();

            // ──── Zoom / Pan state ────
            const ZOOM_FACTOR = 0.3;
            const MIN_SPAN = 0.005;

            function zoomAt(cx, cy, factor) {
                const center = getLatLon(cx, cy);
                const latSpan = viewport.maxLat - viewport.minLat;
                const lonSpan = viewport.maxLon - viewport.minLon;

                const newLatSpan = latSpan * factor;
                const newLonSpan = lonSpan * factor;
                if (newLatSpan < MIN_SPAN || newLonSpan < MIN_SPAN) return;

                const ratioX = cx / W;
                const ratioY = (H - cy) / H;

                viewport.minLon = center.lon - newLonSpan * ratioX;
                viewport.maxLon = center.lon + newLonSpan * (1 - ratioX);
                viewport.minLat = center.lat - newLatSpan * ratioY;
                viewport.maxLat = center.lat + newLonSpan * (1 - ratioY);
                render();
            }

            function zoomCenter(factor) {
                zoomAt(W / 2, H / 2, factor);
            }

            function resetView() {
                viewport.minLat = initialViewport.minLat;
                viewport.maxLat = initialViewport.maxLat;
                viewport.minLon = initialViewport.minLon;
                viewport.maxLon = initialViewport.maxLon;
                render();
            }

            function goToRegion(regionKey) {
                const bounds = REGIONS[regionKey];
                if (!bounds) {
                    resetView();
                    return;
                }
                fitBounds(bounds.minLat, bounds.maxLat, bounds.minLon, bounds.maxLon, 0.15);
                render();
            }

            function goToLatLon(lat, lon, targetSpan = 0.03) {
                viewport.minLat = lat - targetSpan / 2;
                viewport.maxLat = lat + targetSpan / 2;
                
                const avgLat = lat;
                const cosLat = Math.cos(avgLat * Math.PI / 180);
                const canR = W / H;
                const lonD = (targetSpan * canR) / cosLat;
                
                viewport.minLon = lon - lonD / 2;
                viewport.maxLon = lon + lonD / 2;
                render();
            }

            // ──── Wheel zoom ────
            canvas.addEventListener('wheel', (e) => {
                e.preventDefault();
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                const factor = e.deltaY > 0 ? (1 + ZOOM_FACTOR) : (1 - ZOOM_FACTOR);
                zoomAt(mx, my, factor);
            }, { passive: false });

            // ──── Drag pan ────
            let isDragging = false;
            let dragStartX = 0, dragStartY = 0;
            let dragStartViewport = {};

            canvas.addEventListener('mousedown', (e) => {
                isDragging = true;
                dragStartX = e.clientX;
                dragStartY = e.clientY;
                dragStartViewport = { ...viewport };
                canvas.style.cursor = 'grabbing';
            });

            window.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const dx = e.clientX - dragStartX;
                const dy = e.clientY - dragStartY;
                const lonPerPx = (dragStartViewport.maxLon - dragStartViewport.minLon) / W;
                const latPerPx = (dragStartViewport.maxLat - dragStartViewport.minLat) / H;
                viewport.minLon = dragStartViewport.minLon - dx * lonPerPx;
                viewport.maxLon = dragStartViewport.maxLon - dx * lonPerPx;
                viewport.minLat = dragStartViewport.minLat + dy * latPerPx;
                viewport.maxLat = dragStartViewport.maxLat + dy * latPerPx;
                render();
            });

            window.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    canvas.style.cursor = 'grab';
                }
            });

            // ──── Touch gestures ────
            let lastTouches = null;

            canvas.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    isDragging = true;
                    dragStartX = e.touches[0].clientX;
                    dragStartY = e.touches[0].clientY;
                    dragStartViewport = { ...viewport };
                }
                lastTouches = Array.from(e.touches);
            }, { passive: true });

            canvas.addEventListener('touchmove', (e) => {
                e.preventDefault();
                if (e.touches.length === 1 && isDragging) {
                    const dx = e.touches[0].clientX - dragStartX;
                    const dy = e.touches[0].clientY - dragStartY;
                    const lonPerPx = (dragStartViewport.maxLon - dragStartViewport.minLon) / W;
                    const latPerPx = (dragStartViewport.maxLat - dragStartViewport.minLat) / H;
                    viewport.minLon = dragStartViewport.minLon - dx * lonPerPx;
                    viewport.maxLon = dragStartViewport.maxLon - dx * lonPerPx;
                    viewport.minLat = dragStartViewport.minLat + dy * latPerPx;
                    viewport.maxLat = dragStartViewport.maxLat + dy * latPerPx;
                    render();
                } else if (e.touches.length === 2 && lastTouches && lastTouches.length === 2) {
                    const prevDist = Math.hypot(
                        lastTouches[0].clientX - lastTouches[1].clientX,
                        lastTouches[0].clientY - lastTouches[1].clientY
                    );
                    const curDist = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                    if (prevDist > 0) {
                        const rect = canvas.getBoundingClientRect();
                        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
                        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
                        const factor = prevDist / curDist;
                        zoomAt(cx, cy, factor);
                    }
                }
                lastTouches = Array.from(e.touches);
            }, { passive: false });

            canvas.addEventListener('touchend', () => {
                isDragging = false;
                lastTouches = null;
            });

            // ──── Hover / Click interaction ────
            function dist2(v, w) { return (v.x - w.x) ** 2 + (v.y - w.y) ** 2; }
            function distSeg2(p, v, w) {
                let l2 = dist2(v, w);
                if (l2 === 0) return dist2(p, v);
                let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
                t = Math.max(0, Math.min(1, t));
                return dist2(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
            }

            function getHit(mx, my) {
                const mp = { x: mx, y: my };
                if (window.MAP_DATA.restaurants) {
                    for (const r of window.MAP_DATA.restaurants) {
                        if (r.projected && dist2(mp, { x: r.projected.x, y: r.projected.y - 8 }) < 200) {
                            return { type: 'restaurant', data: r };
                        }
                    }
                }
                for (const route of validRoutes) {
                    for (let i = 0; i < route.projected.length - 1; i++) {
                        if (distSeg2(mp, route.projected[i], route.projected[i + 1]) < 100) {
                            return { type: 'route', data: route };
                        }
                    }
                }
                return null;
            }

            let hoveredItem = null;

            canvas.addEventListener('mousemove', (e) => {
                if (isDragging) return;
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
                }
            });

            canvas.addEventListener('click', (e) => {
                if (isDragging) return;
                if (hoveredItem && (hoveredItem.data.link || hoveredItem.data.url)) {
                    window.location.href = hoveredItem.data.link || hoveredItem.data.url;
                }
            });

            canvas.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none';
                hoveredItem = null;
            });

            // ──── Control buttons & Dropdowns ────
            const btnZoomIn = document.getElementById('map-zoom-in');
            const btnZoomOut = document.getElementById('map-zoom-out');
            const btnReset = document.getElementById('map-reset');
            const btnRegionToggle = document.getElementById('map-region-toggle');
            const regionDropdown = document.getElementById('map-region-dropdown');

            if (btnZoomIn) btnZoomIn.addEventListener('click', () => zoomCenter(1 - ZOOM_FACTOR));
            if (btnZoomOut) btnZoomOut.addEventListener('click', () => zoomCenter(1 + ZOOM_FACTOR));
            if (btnReset) btnReset.addEventListener('click', () => {
                resetView();
                if (regionDropdown) {
                    regionDropdown.querySelectorAll('.map-region-item').forEach(b => b.classList.remove('active'));
                    const allBtn = regionDropdown.querySelector('[data-region="all"]');
                    if (allBtn) allBtn.classList.add('active');
                }
            });

            if (btnRegionToggle && regionDropdown) {
                btnRegionToggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    regionDropdown.classList.toggle('open');
                });
                regionDropdown.querySelectorAll('.map-region-item').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const region = btn.dataset.region;
                        goToRegion(region);
                        regionDropdown.classList.remove('open');
                        regionDropdown.querySelectorAll('.map-region-item').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                    });
                });
            }

            // Stat Dropdowns
            document.getElementById('btn-stat-routes')?.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdownRoutes?.classList.toggle('open');
                dropdownRest?.classList.remove('open');
            });
            
            document.getElementById('btn-stat-restaurants')?.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdownRest?.classList.toggle('open');
                dropdownRoutes?.classList.remove('open');
            });

            document.addEventListener('click', () => {
                regionDropdown?.classList.remove('open');
                dropdownRoutes?.classList.remove('open');
                dropdownRest?.classList.remove('open');
            });

            if (dropdownRoutes) {
                dropdownRoutes.addEventListener('click', (e) => {
                    const btn = e.target.closest('.stat-item');
                    if (!btn) return;
                    const r = validRoutes[btn.dataset.idx];
                    if (r && r.points.length > 0) {
                        const mid = r.points[Math.floor(r.points.length / 2)];
                        goToLatLon(mid.lat, mid.lon, 0.05); // slightly wider for route
                    }
                });
            }

            if (dropdownRest) {
                dropdownRest.addEventListener('click', (e) => {
                    const btn = e.target.closest('.stat-item');
                    if (!btn) return;
                    const r = window.MAP_DATA.restaurants[btn.dataset.idx];
                    if (r) goToLatLon(r.lat, r.lon, 0.015); // close zoom for pin
                });
            }
        });
    }

    // ===========================
    // 6. Homepage Sidebar Tabs (AJAX load)
    // ===========================
    if (document.body.id === 'tt-body-index') {
        const categories = {
            'running': '/category/러닝코스',
            'food': '/category/맛집',
            'review': '/category/제품리뷰'
        };

        const loadCategory = async (key, url) => {
            const panel = document.getElementById(`panel-${key}`);
            if (!panel) return;
            try {
                const res = await fetch(url);
                const html = await res.text();
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const posts = Array.from(doc.querySelectorAll('.original-list .post-item')).slice(0, 3);
                
                if (posts.length > 0) {
                    panel.innerHTML = '';
                    posts.forEach((post, index) => {
                        post.style.animationDelay = `${index * 0.08}s`;
                        panel.appendChild(post);
                    });
                } else {
                    panel.innerHTML = '<div class="loading-spinner">등록된 글이 없습니다.</div>';
                }
            } catch (e) {
                panel.innerHTML = '<div class="loading-spinner">불러오기 실패</div>';
            }
        };

        Object.entries(categories).forEach(([key, url]) => loadCategory(key, url));

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
            });
        });
    }

    // ===========================
    // 7. Nearby Restaurants Widget
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
            searchLink.href = `/search/${encodeURIComponent(locationTag + ' 맛집')}`;
            searchLink.innerHTML = `🍽️ <strong>${locationTag}</strong> 맛집 검색 결과 보기`;
            listContainer.appendChild(searchLink);

            if (window.MAP_DATA && window.MAP_DATA.restaurants) {
                window.MAP_DATA.restaurants.forEach(rest => {
                    if (rest.title.includes(locationTag)) {
                        const a = document.createElement('a');
                        a.className = 'nearby-item';
                        a.href = rest.url;
                        a.innerHTML = `🍽️ ${rest.title}`;
                        listContainer.appendChild(a);
                    }
                });
            }
            postContent.appendChild(widget);
        }
    }
});
