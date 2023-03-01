// gets all the maps that are on surfheaven but don't have a picture on the github repo
// run this code in a browser console to print out the missing pics array
let pics_url = "https://api.github.com/repos/Sayt123/SurfMapPics/git/trees/Maps-and-bonuses?recursive=1"
let maps_url = "https://surfheaven.eu/api/maps"

function get_missing_map_pics() {
    let pics = JSON.parse(httpGet(pics_url));
    let map_pics = [];
    for (let i = 0; i < pics.tree.length; i++) {
        let pic = pics.tree[i];
        if (pic.path.includes("surf_")) {
            pic.path = pic.path.replace("csgo/", "");
            pic.path = pic.path.replace(".jpg", "");
            map_pics.push(pic.path);
        }
    }
    return map_pics;
}

function get_sh_maps() {
    let sh_maps = JSON.parse(httpGet(maps_url));
    let maps = [];
    for (let i = 0; i < sh_maps.length; i++) {
        let map = sh_maps[i];
        maps.push(map.map);
    }
    return maps;
}

function httpGet(theUrl) {
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open("GET", theUrl, false); 
    xmlHttp.send(null);
    return xmlHttp.responseText;
}

let maps_with_pics = get_missing_map_pics();
let sh_maps = get_sh_maps();
let missing_pics = [];
for (let i = 0; i < sh_maps.length; i++) {
    let map = sh_maps[i];
    if (!maps_with_pics.includes(map)) {
        missing_pics.push(map);
    }
}
console.log(missing_pics);