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

    // 2. Render Kakao Map on Home Screen
    const mapContainer = document.getElementById('home-map');
    // Check if we are on the home screen and kakao maps SDK is loaded
    if (mapContainer && window.kakao && window.kakao.maps && document.body.id === 'tt-body-index') {
        kakao.maps.load(() => {
            const options = {
                center: new kakao.maps.LatLng(37.5271, 126.9324), // Default center
                level: 7
            };
            const map = new kakao.maps.Map(mapContainer, options);

            // Draw Running Courses (Polylines)
            if (window.MAP_DATA && window.MAP_DATA.runningCourses) {
                window.MAP_DATA.runningCourses.forEach(course => {
                    const linePath = course.path.map(p => new kakao.maps.LatLng(p.lat, p.lng));
                    const polyline = new kakao.maps.Polyline({
                        path: linePath,
                        strokeWeight: 5,
                        strokeColor: '#ff7e67',
                        strokeOpacity: 0.8,
                        strokeStyle: 'solid'
                    });
                    polyline.setMap(map);

                    // Add click event to polyline
                    kakao.maps.event.addListener(polyline, 'click', () => {
                        window.location.href = course.url;
                    });
                });
            }

            // Draw Restaurants (Markers)
            if (window.MAP_DATA && window.MAP_DATA.restaurants) {
                // Custom Marker Image (🍔)
                const imageSrc = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24"><text x="0" y="20" font-size="20">🍔</text></svg>';
                const imageSize = new kakao.maps.Size(30, 30);
                const markerImage = new kakao.maps.MarkerImage(imageSrc, imageSize);

                window.MAP_DATA.restaurants.forEach(rest => {
                    const marker = new kakao.maps.Marker({
                        map: map,
                        position: new kakao.maps.LatLng(rest.lat, rest.lng),
                        image: markerImage,
                        title: rest.title
                    });

                    // Add click event to marker
                    kakao.maps.event.addListener(marker, 'click', () => {
                        window.location.href = rest.url;
                    });
                });
            }
        });
    }

    // 3. Nearby Restaurants Widget (Tag based link)
    const isPostPage = document.body.id === 'tt-body-page';
    const categoryEl = document.querySelector('.post-header .category');
    
    if (isPostPage && categoryEl && categoryEl.textContent.includes('러닝코스')) {
        // Find the first location tag
        const tagEls = document.querySelectorAll('.post-tags a');
        if (tagEls.length > 0) {
            // Assume the first tag is the location, e.g. "여의도"
            const locationTag = tagEls[0].textContent.replace('#', '').trim();
            
            // In a real Tistory blog, you would fetch RSS or search API.
            // Since Tistory lacks a direct tag+category API, we'll simulate fetching from MAP_DATA
            // if we have matching text, or just link to the search page.
            
            const postContent = document.querySelector('.post-content');
            const widget = document.createElement('div');
            widget.className = 'nearby-restaurants';
            widget.innerHTML = `<h3>🏃 '${locationTag}' 근처 추천 맛집</h3><div class="nearby-list"></div>`;
            
            const listContainer = widget.querySelector('.nearby-list');
            
            // For this functional mockup, we link to a search query for this location tag
            const searchLink = document.createElement('a');
            searchLink.className = 'nearby-item';
            searchLink.href = `/search/${encodeURIComponent(locationTag + " 맛집")}`;
            searchLink.innerHTML = `🍽️ <strong>${locationTag}</strong> 맛집 검색 결과 보기`;
            
            listContainer.appendChild(searchLink);
            
            // Check MAP_DATA for explicitly matched restaurants by title keyword
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
