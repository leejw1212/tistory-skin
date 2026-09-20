// 러닝 코스(GPX)와 맛집 데이터를 관리하는 파일입니다.
window.MAP_DATA = {
    gpxFiles: [
        { 
            filename: "sample.gpx", 
            link: "/category/러닝코스/1" 
        }
        // 새 GPX 파일을 스킨에 업로드하고 여기에 추가하세요.
    ],
    restaurants: [
        {
            title: "여의도 수제버거 맛집",
            url: "/category/맛집/2", // 실제 작성하신 글의 URL로 변경하세요
            lat: 37.5265,
            lon: 126.9315 // lon 대신 lat, lng 혼용 방지를 위해 lon으로 통일 (GPX 기준)
        },
        {
            title: "올림픽공원 근처 브런치",
            url: "/category/맛집/3",
            lat: 37.5195,
            lon: 127.1220
        }
    ]
};
