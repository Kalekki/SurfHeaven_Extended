// ==UserScript==
// @name         SurfHeaven ranks Ext
// @namespace    http://tampermonkey.net/
// @version      4.2.13
// @description  More stats and features for SurfHeaven.eu
// @author       kalle, Link
// @updateURL    https://github.com/Kalekki/SurfHeaven_Extended/raw/main/sh.user.js
// @downloadURL  https://github.com/Kalekki/SurfHeaven_Extended/raw/main/sh.user.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/chartist/0.11.4/chartist.min.js
// @match        https://surfheaven.eu/*
// @icon         https://www.google.com/s2/favicons?domain=surfheaven.eu
// @connect      raw.githubusercontent.com
// @connect      surfheaven.eu
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_info
// @license      MIT
// ==/UserScript==


(async function () {
    'use strict';

    const VERSION = GM_info.script.version;
    var use_custom = await GM.getValue('sh_ranks_use_custom_id', false);
    var defaut_id = await GM.getValue('sh_ranks_default_id', get_id());
    var custom_id = await GM.getValue('sh_ranks_custom_id', defaut_id);
    var current_page = "";

    var url_path = window.location.pathname.split('/');
    var api_call_count = 0;
    var has_fetched = false; // has fetched completions of uncompleted maps and bonuses
    var map_completions = {};
    var map_types = {};
    var map_tiers = {};
    var bonus_completions = {};

    // colors are approximate and might be wrong, let me know
    const GROUP_THRESHOLDS =   [1,      2,      3,      10,        25,      50,        75,       100,       150,       250,       500,       750,            1000,     1500,      2000,      3000,     6000,       15000,     25000]
    const GROUP_NAMES =        ["#1",   "#2",   "#3",   "Master",  "Elite", "Veteran", "Expert", "Pro",     "TheSteve","Hotshot", "Skilled", "Intermediate", "Casual", "Amateur", "Regular", "Potato", "Beginner", "Burrito", "Calzone", "New"]
    const GROUP_COLORS =       ["gold", "gold", "gold", "#b57fe5", "red",   "#d731eb", "#6297d1","#6297d1", "#E94A4B", "#55ff4b", "#aef25d", "#ad8adc",      "#ebe58d","#b4c5d9", "#6297d1", "#dfa746","#ccccd4",  "#649ad8", "#ccccd4", "#FFFFFF"]

    const AU_SERVERS = {
        14 : "51.161.199.33:27015",
        15 : "51.161.199.33:27016",
        16 : "51.161.199.33:27017",
        17 : "51.161.199.33:27018",
        18 : "51.161.199.33:27019",
        19 : "51.161.199.33:27020",
        20 : "51.161.199.33:27021",
        21 : "51.161.199.33:27022",
    }

    // SETTINGS
    let settings
    if (unsafeWindow.localStorage.getItem('settings') == null) {
        // defaults
        settings = {
            flags: true,
            follow_list: true,
            update_check: true,
            cp_chart: true,
            steam_avatar: true,
            completions_by_tier: true,
            country_top_100: true,
            hover_info: true,
            map_cover_image: true,
            points_per_rank: true,
        }
        unsafeWindow.localStorage.setItem('settings', JSON.stringify(settings));
    }else{
        settings = JSON.parse(unsafeWindow.localStorage.getItem('settings'));
        validate_settings();
    }

    const settings_labels = {
        flags: "Country flags",
        follow_list: "Follow list",
        update_check: "Automatic update check",
        cp_chart: "Checkpoint chart",
        steam_avatar: "Show Steam avatar",
        completions_by_tier: "Completions by tier",
        country_top_100: "Country top 100 table",
        hover_info: "Player/map info on hover",
        map_cover_image: "Map cover image",
        points_per_rank: "Show points per rank",
    }

    const settings_categories = {
        "Global" : ["flags","follow_list", "hover_info", "update_check"],
        "Dashboard" : ["country_top_100"],
        "Map page" : ["cp_chart","points_per_rank","map_cover_image"],
        "Profile" : ["steam_avatar", "completions_by_tier"]
    }

    function validate_settings(){
        if (settings.flags == null) settings.flags = true;
        if (settings.follow_list == null) settings.follow_list = true;
        if (settings.update_check == null) settings.update_check = true;
        if (settings.cp_chart == null) settings.cp_chart = true;
        if (settings.steam_avatar == null) settings.steam_avatar = true;
        if (settings.completions_by_tier == null) settings.completions_by_tier = true;
        if (settings.country_top_100 == null) settings.country_top_100 = true;
        if (settings.hover_info == null) settings.hover_info = true;
        if (settings.map_cover_image == null) settings.map_cover_image = true;
        if (settings.points_per_rank == null) settings.points_per_rank = true;
    }

    // SERVERS PAGE
    if (window.location.pathname.endsWith("/servers/")) {
        current_page = "servers";
        servers_page();
    }
    // PROFILE PAGE
    else if (url_path[url_path.length - 2] == "player") {
        current_page = "profile";
        profile_page();
    }
    // MAP PAGE
    else if (url_path[url_path.length - 2] == "map") {
        current_page = "map";
        var current_map_name = url_path[url_path.length - 1];
        map_page(current_map_name);
    }
    // DASHBOARD
    else if (window.location.pathname == "/") {
        current_page = "dashboard";
        dashboard_page();
    }
    else{
        current_page = url_path[url_path.length - 2];
        if(current_page == "donate"){
            // Gift vip
            if (unsafeWindow.localStorage.getItem('gift_vip_steamid') != null) {
                document.getElementById("authid").value = "http://steamcommunity.com/profiles/"+unsafeWindow.localStorage.getItem('gift_vip_steamid');
                unsafeWindow.localStorage.removeItem('gift_vip_steamid');
                unsafeWindow.checker();
            }
        }
    }
    console.log("Current page: " + current_page);

    // Navbar crowded fix
    if (document.getElementById("navbar").clientHeight > 60) {
        make_navbar_compact();
    }
    window.addEventListener('resize', function () {
        if (document.getElementById("navbar").clientHeight > 60) {
            make_navbar_compact();
        }
    });

    // Update check
    if(settings.update_check){
        if (unsafeWindow.localStorage.getItem('update_last_checked') == null) {
            unsafeWindow.localStorage.setItem('update_last_checked', Date.now());
        }
        else if (Date.now() - unsafeWindow.localStorage.getItem('update_last_checked') > 1000*60*5) {
            unsafeWindow.localStorage.setItem('update_last_checked', Date.now());
            check_for_updates();
        }
    
    }

    function check_for_updates(){
        GM_xmlhttpRequest({
            method: "GET",
            url: "https://raw.githubusercontent.com/Kalekki/SurfHeaven_Extended/main/changelog.txt",
            onload: function (response) {
                if(response.status != 200) return;
                var latest_version = response.responseText.split("___")[1];
                console.log("Current version: " + VERSION + " | Latest version: " + latest_version)
                if (latest_version != VERSION) {
                    let update_url = "https://github.com/Kalekki/SurfHeaven_Extended/raw/main/sh.user.js"
                    let modal = document.createElement('div');
                    modal.innerHTML = `
                    <div class="modal fade" id="update_modal" tabindex="-1" role="dialog" style="display: flex; z-index:99999">
                    <div class="modal-dialog" role="document">
                        <div class="modal-content">
                            <div class="modal-body" style="padding: 1rem;">
                                <h5 class="modal-title" style="margin-bottom:1rem;">SH Extended update available!</h5>
                                <p>Version <span style="color:salmon;">${VERSION}</span> -> <span style="color: lightgreen">${latest_version}</span</p>
                                <p style="color:white;">What's new:</p>
                                <textarea readonly style="width:100%;height:80px; background-color:#21242a; color:white;">${response.responseText.split("___")[2]}</textarea>
                            </div>
                            <div class="modal-footer" style="padding:7px;">
                                <small style="text-align: left;">You can disable this message in the settings.</small>
                                <button type="button" class="btn btn-secondary btn-danger" data-dismiss="modal">Close</button>
                                <a href="${update_url}" target="_blank" onclick="$('#update_modal').modal('hide');" class="btn btn-primary btn-success">Update</a>
                            </div>
                        </div>
                    </div>
                </div>
                    `;
                    document.body.appendChild(modal);
                    $('#update_modal').modal('show');
                }
            }
        });
    }

    // Follow list
    if (settings.follow_list) {
        const sidebar_div = document.querySelector('.navigation');
        const follow_list_root_div = document.createElement('div');
        const follow_list_row_div = document.createElement('div');
        const follow_list_panel_div = document.createElement('div');
        const follow_list_panel_body_div = document.createElement('div');
        const follow_h5 = document.createElement('h5');

        follow_h5.className = "text-center";
        follow_h5.innerHTML = "<a href='#' style='color:white;'>FOLLOWED PLAYERS</a>";
        follow_h5.addEventListener("click", follow_list_manager);
        follow_h5.classList.add("text-white");
        follow_list_root_div.className = "row-recentactivity";
        follow_list_row_div.className = "col-sm-12";
        follow_list_panel_div.className = "panel panel-filled";
        follow_list_panel_body_div.className = "panel-body";
        follow_list_panel_body_div.id = "follow_list";
        follow_list_panel_body_div.style = "padding: 5px;";

        follow_list_root_div.appendChild(follow_list_row_div);
        follow_list_row_div.appendChild(follow_list_panel_div);
        follow_list_panel_div.appendChild(follow_list_panel_body_div);

        make_request("https://api.surfheaven.eu/api/online/", (data) => {
            let follow_list = get_follow_list();
            let online_players = [];
            let friends_online = false;
            data.forEach((player) => {
                online_players.push([player.steamid, player.name, player.server, player.map, player.region]);
            });
            online_players.forEach((player) => {
                if (follow_list.includes(player[0])) {
                    friends_online = true;
                    let follow_list_item = document.createElement('h5');
                    if(player[4] == "AU"){
                        follow_list_item.innerHTML = `<a href="https://surfheaven.eu/player/${player[0]}">${player[1]}</a> in <a href="steam://connect/${AU_SERVERS[player[2]]}" title="${player[3]}" style="color:rgb(0,255,0)">#${player[2]-13} (AU)</a>`
                    } else {
                        follow_list_item.innerHTML = `<a href="https://surfheaven.eu/player/${player[0]}">${player[1]}</a> in <a href="steam://connect/surf${player[2]}.surfheaven.eu" title="${player[3]}" style="color:rgb(0,255,0)">#${player[2]}</a>`
                    }
                    follow_list_panel_body_div.appendChild(follow_list_item);
                }
            });
            if (!friends_online) {
                let follow_list_item = document.createElement('h5');
                follow_list_item.innerHTML = "No friends online :(";
                follow_list_panel_body_div.appendChild(follow_list_item);
            }

            if (follow_list != null && follow_list[0] != "") {
                sidebar_div.insertBefore(follow_list_root_div, sidebar_div.firstChild);
                sidebar_div.insertBefore(follow_h5, sidebar_div.firstChild);
            }
            insert_flags_to_profiles(); // needed to be called again to get the flags on the follow list
        });

        // refresh follow list
        const follow_list_refresh_interval = 60*1000;
        setInterval(() => {
            refresh_follow_list();
        }, follow_list_refresh_interval);
    }else{
        insert_flags_to_profiles();
    }

    function follow_list_manager(){
        let follow_list = get_follow_list();
        const follow_list_root = document.createElement('div');
        follow_list_root.style.overflowY = "scroll";
        follow_list_root.style.maxHeight = "600px";

        for(let i = 0; i < follow_list.length; i++){
            make_request(`https://api.surfheaven.eu/api/playerinfo/${follow_list[i]}`, (data) => {
                let follow_list_item = document.createElement('div');
                follow_list_item.style = "white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";

                let name = data[0].name;
                let last_online = data[0].lastplay;

                const profile_link = document.createElement('a');
                profile_link.href = `https://surfheaven.eu/player/${follow_list[i]}`;
                profile_link.innerHTML = name != "" ? name : follow_list[i];
                profile_link.style = "width:220px; float: left;";
                const last_online_span = document.createElement('span');
                last_online_span.style = "float: right;";
                last_online_span.innerHTML = `Last play ${format_date(last_online)} `;
                last_online_span.setAttribute("data-last-online", last_online); // for sorting

                const unfollow_button = document.createElement('button');
                unfollow_button.className = "btn btn-danger btn-xs float-right";
                unfollow_button.style.marginTop = "1px";
                unfollow_button.style.marginLeft = "1rem";
                unfollow_button.style.marginRight = "0.5rem";
                unfollow_button.style.marginBottom = "1px";
                unfollow_button.innerHTML = "Unfollow";
                unfollow_button.onclick = () => {
                    follow_list_root.removeChild(follow_list_item);
                    follow_user(follow_list[i]);
                };

                follow_list_item.appendChild(profile_link)
                last_online_span.appendChild(unfollow_button);
                follow_list_item.appendChild(last_online_span);
                follow_list_root.appendChild(follow_list_item);

                insert_flags_to_profiles();
                if(follow_list_root.querySelectorAll('div').length == follow_list.length){
                    let follow_list_items = follow_list_root.children;
                    let follow_list_items_array = [];
                    for(let j = 0; j < follow_list_items.length; j++){
                        follow_list_items_array.push(follow_list_items[j]);
                    }
                    follow_list_items_array.sort((a, b) => {
                        let a_last_online = a.querySelector('span').getAttribute("data-last-online");
                        let b_last_online = b.querySelector('span').getAttribute("data-last-online");
                        return new Date(b_last_online) - new Date(a_last_online);
                    });
                    while (follow_list_root.firstChild) {
                        follow_list_root.removeChild(follow_list_root.firstChild);
                    }
                    follow_list_items_array.forEach((item, index) => {
                        follow_list_root.appendChild(item);
                        if (index % 2 == 0) {
                            item.style.backgroundColor = "#19202B";
                        }
                    });
                    insert_flags_to_profiles();
                    
                }
            });
            
        }
        show_overlay_window("Followed players", follow_list_root);
    }



    function refresh_follow_list(){
        console.log("Refreshing follow list")
        let follow_list = get_follow_list();
        let follow_list_panel_body_div = document.querySelector('div.row-recentactivity:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1)');
        if (follow_list != null && follow_list[0] != "") {
            make_request("https://api.surfheaven.eu/api/online/", (data) => {
                let online_players = [];
                let friends_online = false;
                data.forEach((player) => {
                    online_players.push([player.steamid, player.name, player.server, player.map, player.region]);
                });
                online_players.forEach((player) => {
                    if (follow_list.includes(player[0])) {
                        friends_online = true;
                    }
                });
                if (friends_online) {
                    follow_list_panel_body_div.innerHTML = "";
                    online_players.forEach((player) => {
                        if (follow_list.includes(player[0])) {
                            let follow_list_item = document.createElement('h5');
                            if(player[4] == "AU"){
                                follow_list_item.innerHTML = `<a href="https://surfheaven.eu/player/${player[0]}">${player[1]}</a> in <a href="steam://connect/${AU_SERVERS[player[2]]}" title="${player[3]}" style="color:rgb(0,255,0)">#${player[2]-13} (AU)</a>`
                            } else {
                                follow_list_item.innerHTML = `<a href="https://surfheaven.eu/player/${player[0]}">${player[1]}</a> in <a href="steam://connect/surf${player[2]}.surfheaven.eu" title="${player[3]}" style="color:rgb(0,255,0)">#${player[2]}</a>`
                            }
                            follow_list_panel_body_div.appendChild(follow_list_item);
                        }
                    });
                    insert_flags_to_profiles();
                }
                else{
                    follow_list_panel_body_div.innerHTML = "";
                    let follow_list_item = document.createElement('h5');
                    follow_list_item.innerHTML = "No friends online :(";
                    follow_list_panel_body_div.appendChild(follow_list_item);
                }
            });
            
        }
    }

    
    // listening for clicks to add flags when tabulating through multi-page tables (top 100, reports etc.)
    document.addEventListener('click', (e) => {
        if (e.target.tagName == "A" && current_page != "servers") {
            insert_flags_to_profiles();
        }
    });

    function format_date(time){
        let today = new Date();
        let date = new Date(time);
        let diff = today - date;
        let days = Math.floor(diff / (1000 * 60 * 60 * 24));
        let minutes = Math.floor(diff / (1000 * 60));
        if(days == 0 && minutes < 60){
          return minutes + " minutes ago";
        } else if(days == 0 && minutes >= 60){
          let hours = Math.floor(minutes/60);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     
          minutes -= hours * 60;
          return hours + "h " + minutes + "m ago";
        }else if(days == 1){
          return "Yesterday";
        }else if(days < 7){
          return days + "d ago";
        }else{
          let month = date.toLocaleString('default', { month: 'short' });
          return month + " " + date.getDate() + ", " + date.getFullYear();
        }
    }   

    //Hover info
    if (settings.hover_info) {
        const hover_div = document.createElement('div');
        hover_div.id = "hover-div";
        document.body.appendChild(hover_div);

        let hover_timeout;
        let hover_length = 400; // ms to wait before showing hover info, cumulative with api response time

        function fade_in(element){
            element.classList.add('show')
        }
        function fade_out(element){
            element.classList.remove('show')
        }

        document.addEventListener('mouseover', (e) => {
            if(e.target.tagName == "A" && !e.target.href.includes("#") && e.target.parentElement.tagName != "LI"){
                hover_timeout = setTimeout(() => {
                    if(e.target.href.includes("player")){
                        let steamid = e.target.href.split('/')[4];
                        make_request(`https://api.surfheaven.eu/api/playerinfo/${steamid}`, (data) => {
                            display_hover_info(data, 0, e)
                        });

                    }else if(e.target.href.includes('map')){
                        let map_name = e.target.href.split('/')[4];
                        make_request(`https://api.surfheaven.eu/api/mapinfo/${map_name}`, (data) => {
                            display_hover_info(data, 1, e)
                        });
                    }
                },hover_length)
            }
        });
        document.addEventListener('mouseout', (e) => {
            if(e.target.tagName == "A"){
                clearTimeout(hover_timeout)
            }
            fade_out(hover_div);
        });

        function display_hover_info(data, type, e){
            let left_offset = 10;
            hover_div.style.top = (e.target.getBoundingClientRect().top+ Math.floor(window.scrollY))  + "px";
            hover_div.style.left = (e.target.getBoundingClientRect().right + left_offset) + "px";
            hover_div.style.paddingTop = "0px";
            hover_div.style.paddingBottom = "0px";
            hover_div.textContent = "Loading...";
            hover_div.style.zIndex = "99999";
            fade_in(hover_div);

            function format_time(time){
                return Math.floor(time/3600) + "." + Math.floor((time%3600)/60);
            }
            function format_points(points){
                // 4300 -> 4.3k
                if(points < 1000){
                    return points;
                }else{
                    return Math.floor(points/1000) + "." + Math.floor((points%1000)/100) + "k";
                }
            }
            // type = 0 -> player
            // type = 1 -> map
            if(type == 0){
                hover_div.style.backgroundColor = "rgba(13,17,23,0.6)";
                hover_div.style.backgroundImage = "none";
                hover_div.innerHTML = `<div class="row">
                <div class="col-sm-5">
                    <h5>Rank</h5>
                    <h5>Points</h5>
                    <h5>Playtime</h5>
                    <h5>Last seen</h5>
                </div>
                <div class="col-sm-7">
                    <h5>#${data[0].rank} (${create_flag(data[0].country_code)} #${data[0].country_rank})</h5>
                    <h5>${format_points(data[0].points)} [${(data[0].rankname == "Custom" ? "#"+ data[0].rank : '<span style="color:'+GROUP_COLORS[GROUP_NAMES.indexOf(data[0].rankname)]+';">'+data[0].rankname)+"</span>"}]</h5>
                    <h5>${format_time(data[0].playtime)}h</h5>
                    <h5>${format_date(data[0].lastplay)}</h5>
                </div>
            </div>
            `;
            }
            if(type == 1){
                const img = new Image();
                img.src = `https://github.com/Sayt123/SurfMapPics/raw/Maps-and-bonuses/csgo/${data[0].map}.jpg`;

                img.onload = function() {
                    hover_div.style.backgroundImage = `url(${img.src})`;
                    hover_div.style.backgroundSize = "cover";
                    hover_div.style.backgroundPosition = "center";

                    hover_div.innerHTML = `
                    <div class="row outlined text-center" style="min-width: 18vw; min-height: 18vh;">
                        <h5>T${data[0].tier} ${(data[0].type == 0 ? " linear" : " staged")} by ${data[0].author}</h5>
                        <!--<h5>Added ${format_date(data[0].date_added)} / ${data[0].completions} completions</h5>-->
                    </div>
                `;
                    hover_div.style.top = (e.target.getBoundingClientRect().top+ Math.floor(window.scrollY) - (hover_div.getBoundingClientRect().height/2))  + "px";
                };

                img.onerror = function() {
                    hover_div.style.backgroundColor = "rgba(13,17,23,0.6)";
                    hover_div.style.backgroundImage = "none";
                    hover_div.innerHTML = `<div class="row">
                    <div class="col-sm-4">
                        <h5>Type</h5>
                        <h5>Author</h5>
                        <h5>Added</h5>
                        <h5>Finishes</h5>
                    </div>
                    <div class="col-sm-8">
                        <h5>T${data[0].tier} ${(data[0].type == 0 ? " linear" : " staged")}</h5>
                        <h5>${data[0].author}</h5>
                        <h5>${format_date(data[0].date_added)}</h5>
                        <h5>${data[0].completions}</h5>
                    </div>
                </div>`;
                };

                hover_div.style.backgroundImage = "none";
                hover_div.innerHTML = `<div class="row">
                <h5>Loading...</h5>
                </div>`;    


            }
            hover_div.style.top = (e.target.getBoundingClientRect().top + Math.floor(window.scrollY) - (hover_div.getBoundingClientRect().height/2) + (e.target.getBoundingClientRect().height/2)) + "px";
        }
    }

    const navbar = document.querySelector('.nav');
    const li_wrapper = document.createElement('li');
    const settings_link = document.createElement('a');
    const map_tag_link = document.createElement('a');
    const map_tag_li = document.createElement('li');
    map_tag_link.href = "#";
    settings_link.href = "#";
    li_wrapper.appendChild(settings_link);
    map_tag_li.appendChild(map_tag_link);
    map_tag_link.innerHTML = `MAP TAGS <i class="fa fa-tags"></i>`;
    settings_link.innerHTML = `SETTINGS <i class="fa fa-cog fa-lg"></i>`;
    settings_link.addEventListener('click', open_settings_menu);
    map_tag_link.addEventListener('click', open_map_tag_menu);
    navbar.insertBefore(map_tag_li, navbar.children[4]);
    navbar.insertBefore(li_wrapper, navbar.children[5]);

    function show_overlay_window(window_title,element_to_append){
        const overlay = document.createElement('div');
        overlay.id = "overlay";
        overlay.style.position = "fixed";
        overlay.style.top = "50%";
        overlay.style.left = "50%";
        overlay.style.transform = "translate(-50%, -50%)";
        overlay.style.zIndex = "9999";
        overlay.style.border = "1px solid rgba(0,0,0,1)";
        overlay.style.borderRadius = "0.5rem";

        const close_button = document.createElement("button");
        close_button.type = "button";
        close_button.id = "close_button";
        close_button.classList.add("btn", "btn-sm", "btn-outline-secondary");
        close_button.style.position = "absolute";
        close_button.style.top = "6px";
        close_button.style.right = "6px";
        close_button.style.padding = "5px 5px";
        close_button.innerHTML = `<i class="fas fa-times fa-lg"></i>`;
        close_button.addEventListener('click', () => {
            overlay.remove();
        });

        const title = document.createElement("h4");
        title.style.marginTop = "0px";
        title.style.display = "inline-block";
        title.style.padding= "1rem"
        title.textContent = window_title;

        const inner_panel = document.createElement('div');
        inner_panel.style = "background-color: #0D1117; width: auto; height: auto; padding:0.5rem; border-radius: 5px; box-shadow: 0px 0px 15px 5px rgba(0,0,0,0.5);overflow-y: auto; overflow-x: hidden;"

        inner_panel.appendChild(title);
        inner_panel.appendChild(close_button);

        overlay.appendChild(inner_panel);
        inner_panel.appendChild(element_to_append);
        document.body.appendChild(overlay);
    }

    async function make_request_async(url) {
        const response = await fetch(url);
        if (response.status === 502) {
            console.log(`API call failed, status code: ${response.status}`);
            return false;
        }
        try {
            const data = await response.json();
            if (data.length > 0) {
                return data;
            } else {
                console.log(`API call returned no data for: ${url}`);
                return false;
            }
        } catch (error) {
            console.log(`An error occurred while parsing the response: ${error}`);
            return false;
        }
    }
    
    function make_request(url, func) {
      make_request_async(url)
        .then((data) => {
            if(data){
                func(data);
            }else{
                func(false)
            }
        });
      api_call_count++;
    }
    
    function make_navbar_compact(){
        let navbar = document.querySelector('form.navbar-form');
        let items = navbar.querySelectorAll('li');
        for(let i = 0; i < items.length; i++){
            let a = items[i].querySelector('a');
            if(a.href.includes('discord') || a.href.includes('youtube')){
                items[i].remove();
            }
        }
        // more compact search bar
        let search_bar = document.querySelector('input.form-control:nth-child(4)')
        search_bar.style.width = '150px'
        search_bar.placeholder = 'Search'
        
    }

    function map_youtube_link(map_name) {
        var links = Array.from(document.querySelectorAll('a'));
        var has_youtube_link = links.some(function(e) {
            return e.href.includes('youtube.com/watch');
        });
        if (!has_youtube_link) {
            var media_div = document.querySelector('.media');
            var youtube_link = document.createElement('h5');
            youtube_link.innerHTML = `<i style="color: red;" class="fab fa-youtube fa-lg"></i><a href="https://www.youtube.com/results?search_query=${map_name}" target="_blank">Search the map on Youtube</a>`;
            media_div.appendChild(youtube_link);
        }
    }

    function purge_flags_cache() {
        Object.keys(unsafeWindow.localStorage).forEach(function (key, value) {
            if (!isNaN(key)) {
                unsafeWindow.localStorage.removeItem(key);
            }
        });
    }

    function add_country_dropdown() {
        $(document).ready(function () {
            var countries = [
                "ALA", "ALB", "DZA", "AND", "AGO", "AIA", "ATG", "ARG", "ARM", "ABW", "AUS", "AUT", "AZE", "BHR", "BGD", "BLR", "BEL",
                "BLZ", "BMU", "BOL", "BIH", "BRA", "BRN", "BGR", "KHM", "CAN", "CPV", "CYM", "CHL", "CHN", "HKG", "MAC", "COL", "CRI",
                "CIV", "HRV", "CUW", "CYP", "CZE", "DNK", "DOM", "ECU", "EGY", "SLV", "EST", "FRO", "FIN", "FRA", "GEO", "DEU", "GHA",
                "GIB", "GRC", "GRL", "GLP", "GUM", "GTM", "GGY", "HND", "HUN", "ISL", "IND", "IDN", "IRN", "IRQ", "IRL", "IMN", "ISR",
                "ITA", "JPN", "JEY", "JOR", "KAZ", "KEN", "PRK", "KOR", "KWT", "KGZ", "LVA", "LBN", "LBY", "LIE", "LTU", "LUX", "MKD",
                "MDG", "MYS", "MDV", "MLI", "MLT", "MTQ", "MRT", "MUS", "MEX", "MDA", "MCO", "MNG", "MNE", "MAR", "MMR", "NAM", "NPL",
                "NLD", "ANT", "NZL", "NGA", "MNP", "NOR", "OMN", "PAK", "PSE", "PAN", "PRY", "PER", "PHL", "POL", "PRT", "PRI", "QAT",
                "REU", "ROU", "RUS", "SPM", "SMR", "SAU", "SEN", "SRB", "SYC", "SGP", "SVK", "SVN", "ZAF", "ESP", "LKA", "SDN", "SWE",
                "CHE", "SYR", "TWN", "TJK", "TZA", "THA", "TTO", "TUN", "TUR", "UKR", "ARE", "GBR", "USA", "URY", "UZB", "VEN", "VNM",
                "ZMB", "XKX"
            ];
            var ctop_panel_heading_div = document.getElementsByClassName('panel-heading')[1];
            var ctop_title_text = ctop_panel_heading_div.querySelector('span');
            var ctop_dropdown = document.createElement('select');
            ctop_dropdown.className = "form-control";
            ctop_dropdown.style = "width: 100px; display: inline; margin-right: 10px;";
            ctop_dropdown.id = "ctop_dropdown";
            for (var i = 0; i < countries.length; i++) {
                var ctop_option = document.createElement('option');
                var full_name = new Intl.DisplayNames(['en'], {
                    type: 'region'
                });
                var country_name = full_name.of(countryISOMapping(countries[i]));
                ctop_option.innerHTML = country_name;
                ctop_option.value = countries[i];
                ctop_dropdown.appendChild(ctop_option);
            }
            ctop_panel_heading_div.insertBefore(ctop_dropdown, ctop_title_text);
            ctop_dropdown.selectedIndex = countries.indexOf(unsafeWindow.localStorage.getItem("country"));
            ctop_dropdown.addEventListener('change', function () {
                var country = ctop_dropdown.value;
                unsafeWindow.localStorage.setItem("country", country);
                window.location.reload();
            });
        });
    }

    function reset_ranks() {
        const table = document.querySelector('.table');
        if (table.rows[0].childElementCount >= 6) {
            for (let row of table.rows) {
                row.deleteCell(4);
                row.deleteCell(3);
                if (row.cells[2].childElementCount >= 2) {
                    row.cells[2].removeChild(row.cells[2].children[2]);
                }
            }
        }
    }

    async function set_id() {
        var id_input = document.querySelector('.custom-id-input');

        if (id_input.value) {
            make_request("https://api.surfheaven.eu/api/playerinfo/" + id_input.value, async (data) => {
                if (data) {
                    custom_id = id_input.value;
                    await GM.setValue('sh_ranks_custom_id', custom_id);

                    id_input.placeholder = custom_id;
                    id_input.value = "";
                    document.querySelector('.custom-id-button').disabled = true;

                    reset_ranks();
                    fetch_ranks(custom_id);
                }
            });

        }
    }

    async function handle_input_change() {
        document.querySelector('.custom-id-button').disabled = false;
    }

    async function handle_checkbox(cb) {
        var my_div = document.querySelector('.custom-id-div');
        cb.target.disabled = true;
        if (cb.target.checked) {
            await GM.setValue('sh_ranks_use_custom_id', true);

            var id_input = document.createElement('input');
            id_input.className = 'form-control custom-id-input';
            id_input.style = "display: inline-block; margin-left: 10px; border: 1px solid rgb(247, 175, 62); width: 100px;"
            id_input.type = "text";
            id_input.oninput = handle_input_change;

            var button = document.createElement('button');
            button.className = 'btn btn-success btn-xs custom-id-button';
            button.innerHTML = "Set";
            button.style = 'margin-left: 10px;'
            button.onclick = set_id;

            if (custom_id) {
                id_input.placeholder = custom_id;
                button.disabled = true;
            }

            my_div.appendChild(id_input);
            my_div.appendChild(button);
            if (custom_id) {
                reset_ranks();
                fetch_ranks(custom_id);
            }
        } else {
            await GM.setValue('sh_ranks_use_custom_id', false);

            my_div.removeChild(my_div.lastElementChild)
            my_div.removeChild(my_div.lastElementChild)
            reset_ranks();
            auto_fetch_ranks();
        }
    }

    async function do_after(func, timeout) {
        return new Promise(resolve => {
            setTimeout(func, timeout);
            resolve();
        });
    }

    function insert_flags_to_profiles() {
        let follow_list = get_follow_list();
        var a = document.getElementsByTagName('a');
        Array.from(a).forEach(function (link) {
            if (link.href.includes("https://surfheaven.eu/player/")) {
                if (link.href.includes("#")) {
                    return;
                }
                // robert added flags on his ctop in a different way compared to the global top
                if (link.previousElementSibling && link.previousElementSibling.className.includes("flag")) return;

                if (!link.querySelector('img')) {
                    var country = ""
                    var id = link.href.split("https://surfheaven.eu/player/")[1];

                    if (follow_list.includes(id) && link.parentElement.parentElement.id != "follow_list")  {
                        link.classList.add("following");
                    }

                    if(!settings.flags) return;
                    var cached_country = unsafeWindow.localStorage.getItem(id);
                    if (cached_country) {
                        country = cached_country;
                        link.innerHTML = create_flag(country) + " " + link.innerHTML;
                    } else {
                        make_request("https://api.surfheaven.eu/api/playerinfo/" + id, (data) => {
                            if (data) {
                                country = data[0].country_code;
                                unsafeWindow.localStorage.setItem(id, country);
                                link.innerHTML = create_flag(country) + " " + link.innerHTML;
                            }
                        })
                    }
                }
            }
        });
    }

    function create_flag(country) {
        var flag = document.createElement('img');
        flag.src = country_code_to_flag_url(country);
        flag.style = "margin-right: 2px; margin-bottom: 2px; width: 23px; height:14px;";
        return flag.outerHTML;
    }

    function fetch_map_rank(map_name) {
        var _id = get_id();
        var titlediv = document.querySelector('.media');
        var rank_elem = document.createElement('h4');
        rank_elem.innerHTML = "You have not completed this map :(";
        rank_elem.style.marginBottom = "5px";
        rank_elem.style.marginTop = "5px";
        titlediv.appendChild(rank_elem);
        make_request("https://api.surfheaven.eu/api/maprecord/" + map_name + "/" + _id, (data) => {
            if(!data) return;
            var time = data[0].time;
            let date_completed = new Date(data[0].date);
            var formatted_time = new Date(time * 1000).toISOString().substr(11, 12);
            if (formatted_time[0] == "0") {
                formatted_time = formatted_time.substr(3);
            }
            rank_elem.innerHTML = "Your rank: #" + data[0].rank + " (" + formatted_time + ") +" + data[0].points + " points";
            rank_elem.title = "Completed on " + date_completed.toLocaleDateString() + " at " + date_completed.toLocaleTimeString();
            add_shadow_to_text_recursively(rank_elem);
        });
    }

    function completions_by_tier(id) {
        if(!settings.completions_by_tier) return;
        var completions = new Array(7).fill(0);
        var total = new Array(7).fill(0);
        var bonus_completions = new Array(7).fill(0);
        var bonus_total = new Array(7).fill(0);
        make_request("https://api.surfheaven.eu/api/records/" + id, (data) => {
            if (data) {
                for (let i = 0; i < data.length; i++) {
                    let track = data[i].track;
                    let tier = data[i].tier;
                    if (track == 0) {
                        completions[tier - 1]++;
                    } else {
                        bonus_completions[tier - 1]++;
                    }
                }
                make_request("https://api.surfheaven.eu/api/maps", (data2) => {
                    for (let i = 0; i < data2.length; i++) {
                        let tier = data2[i].tier;
                        total[tier - 1]++;
                        bonus_total[tier - 1] += data2[i].bonus;
                    }
                    let labels = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
                    let completions_data = completions.map(function(value, index) {
                        return Math.floor(value / (value + total[index] - value) * 100);
                    });
                    let bonus_completions_data = bonus_completions.map(function(value, index) {
                        return Math.floor(value / (value + bonus_total[index] - value) * 100);
                    });

                    let target_row = ".panel-c-warning > div:nth-child(1) > div:nth-child(1)"
                    let target_div = document.querySelector(target_row);
                    let user_div = document.querySelector(target_row + " > div:nth-child(1)");
                    let stats_div = document.querySelector(target_row + " > div:nth-child(2)");
                    let completionsbytier_div = document.createElement('div');
                    let completionsbytier_title = document.createElement('h4');

                    user_div.className = "col-sm-4";
                    stats_div.className = "col-md-4";
                    completionsbytier_div.className = "col-md-4 ct-chart";
                    completionsbytier_div.style.height = target_div.clientHeight + "px";
                    completionsbytier_title.style = "margin-top: 0px;margin-bottom: 5px;"
                    completionsbytier_title.innerHTML = "<span style='float:left;'>Completions by Tier</span><div style='display: inline-block; width: 10px; height: 10px; background-color:CornflowerBlue;'></div> Map <div style='display: inline-block; width: 10px; height: 10px; background-color: DarkSeaGreen;'></div> Bonus</span>";
                    completionsbytier_title.classList.add("text-right");

                    completionsbytier_div.appendChild(completionsbytier_title);
                    target_div.appendChild(completionsbytier_div);

                    new Chartist.Bar('.ct-chart', {
                        labels: labels,
                        series: [
                            completions_data,
                            bonus_completions_data
                        ]
                    }, {
                        stackBars: false,
                        axisY: {
                        onlyInteger: true,
                        labelInterpolationFnc: function(value) {
                            return value + '%';
                          }
                        }
                    });
                });
            }
        });
    }

    function get_id() {
        var id = "";
        if (use_custom) {
            id = custom_id;
        } else {
            make_request("https://api.surfheaven.eu/api/id", (data) => {
                id = data[0].steamid;
                GM.setValue('sh_ranks_default_id', id);
            });
        }
        return id != "" ? id : defaut_id;
    }

    function fetch_country_rank(id) {
        make_request("https://api.surfheaven.eu/api/playerinfo/" + id, (data) => {
            if (data) {
                var country_rank = data[0].country_rank;
                var country_rank_total = data[0].country_ranktotal;
                var country_rank_html = document.createElement('h5');
                country_rank_html.innerHTML = ' <i style="font-size:1em" class="pe pe-7s-star c-accent fa-3x"></i> Country Rank: ' + country_rank + "/" + country_rank_total;
                var stats_h5 = document.querySelector('.media > h5:nth-child(4)');
                stats_h5.innerHTML += country_rank_html.innerHTML;
            }
        });
    }

    function fetch_time_spent(id) {
        make_request("https://api.surfheaven.eu/api/playerinfo/" + id, (data) => {
            if (data) {
                var time_spent_spec = data[0].totalspec;
                var time_spent_loc = data[0].totalloc;
                time_spent_loc = (time_spent_loc / 3600).toFixed(2);
                time_spent_spec = (time_spent_spec / 3600).toFixed(2);
                var ts_tr = document.createElement('tr');
                var ts_td = document.createElement('td');
                var ts_td2 = document.createElement('td');
                ts_td.innerHTML = '<strong class="c-white">' + time_spent_spec + "</strong> Hours in spec";
                ts_td2.innerHTML = '<strong class="c-white">' + time_spent_loc + "</strong> Hours in loc";
                ts_tr.appendChild(ts_td);
                ts_tr.appendChild(ts_td2);
                var stats_table = document.querySelector('.medium > tbody:nth-child(1)');
                stats_table.appendChild(ts_tr);
            }
        });
    }

    function fetch_completions_of_uncompleted_maps() {
        make_request("https://api.surfheaven.eu/api/completions", (data) => {
            if (data) {
                data.forEach((map) => {
                    if (map.track == 0) {
                        // Main map
                        map_completions[map.map] = map.completions;
                    } else {
                        // Bonus stage
                        var bonus_map = map.map + " " + map.track;
                        if (map.completions != undefined) { // LOOKING AT YOU surf_fornax b7
                            bonus_completions[bonus_map] = map.completions;
                        } else {
                            bonus_completions[bonus_map] = 0;
                        }
                    }
                    if (map.type != undefined) {
                        map_types[map.map] = map.type == 0 ? "Linear" : "Staged";
                    }
                });
                make_request("https://api.surfheaven.eu/api/maps", (data2) => {
                    if (data2) {
                        data2.forEach((map) => {
                            map_tiers[map.map] = map.tier;
                        })
                        has_fetched = true;
                        update_map_completions();
                        update_bonus_completions();
                    }
                })
            }
        })
    }

    function update_map_completions() {
        var a_elements = document.querySelectorAll('#DataTables_Table_1 a');
        a_elements.forEach((a_element) => {
            var map_name = a_element.innerHTML;
            if (map_name.includes("completions")) {
                return;
            }
            var completions_txt = document.createElement('td');
            completions_txt.innerHTML = " " + map_completions[map_name] + " completions";
            completions_txt.style.color = "#949BA2";
            completions_txt.style.float = "right";
            completions_txt.style.marginRight = "15%";
            if (has_fetched) a_element.appendChild(completions_txt);
        });
    }

    function sort_map_completions(order) {
        var map_completions_table = document.querySelector('#DataTables_Table_1');
        var map_rows = map_completions_table.rows;
        var map_names = [];
        for (var i = 1; i < map_rows.length; i++) {
            var map_name = map_rows[i].cells[0].innerHTML;
            map_name = map_name.split(">")[1].split("<")[0];
            map_names.push(map_name);
        }
        if (order == "asc") {
            map_names.sort((a, b) => {
                return map_completions[a] - map_completions[b];
            });
        } else {
            map_names.sort((a, b) => {
                return map_completions[b] - map_completions[a];
            });
        }
        var map_completions_tbody = document.querySelector('#DataTables_Table_1 > tbody:nth-child(2)');
        map_completions_tbody.innerHTML = "";
        map_names.forEach((map_name) => {
            var map_tier = map_tiers[map_name]
            var map_type = map_types[map_name];
            var map_row = document.createElement('tr');
            var map_name_td = document.createElement('td');
            var map_tier_td = document.createElement('td');
            var map_type_td = document.createElement('td');
            map_name_td.innerHTML = "<a href=\"https://surfheaven.eu/map/" + map_name + "\">" + map_name + "</a> <span style=\"color: #949BA2; float: right; margin-right: 15%;\">" + map_completions[map_name] + " completions</span>";
            map_tier_td.innerHTML = map_tier;
            map_type_td.innerHTML = map_type;
            map_row.appendChild(map_name_td);
            map_row.appendChild(map_tier_td);
            map_row.appendChild(map_type_td);
            map_completions_tbody.appendChild(map_row);
        });
    }

    function sort_bonus_completions(order) {
        var bonus_completions_table = document.querySelector('#DataTables_Table_2');
        var bonus_rows = bonus_completions_table.rows;
        var bonus_maps = [];
        for (var i = 1; i < bonus_rows.length; i++) {
            var bonus_map = bonus_rows[i].cells[0].innerHTML;
            bonus_map = bonus_map.split(">")[1].split("<")[0];
            var bonus_number = bonus_rows[i].cells[1].innerHTML;
            bonus_number = bonus_number.split(" ")[1];
            bonus_map = bonus_map + " " + bonus_number;
            bonus_maps.push(bonus_map);
        }
        // some amazing reason surf_fornax b7 is not in the api but is in the table??? without filtering the ordering is broken
        bonus_maps = bonus_maps.filter((bonus_map) => {
            return bonus_map != "surf_fornax 7";
        })
        if (order == "asc") {
            bonus_maps.sort((a, b) => {
                return bonus_completions[a] - bonus_completions[b];
            });
        } else {
            bonus_maps.sort((a, b) => {
                return bonus_completions[b] - bonus_completions[a];
            });
        }
        var bonus_completions_tbody = document.querySelector('#DataTables_Table_2 > tbody:nth-child(2)');
        bonus_completions_tbody.innerHTML = "";
        bonus_maps.forEach((bonus_map) => {
            var bonus_map_row = document.createElement('tr');
            var bonus_map_name_td = document.createElement('td');
            var bonus_map_number_td = document.createElement('td');
            bonus_map_name_td.innerHTML = "<a href=\"https://surfheaven.eu/map/" + bonus_map.split(" ")[0] + "\">" + bonus_map.split(" ")[0] + "</a> <span style=\"color: #949BA2; float: right; margin-right: 15%;\">" + (bonus_completions[bonus_map] != undefined ? bonus_completions[bonus_map] : 0) + " completions</span>"
            bonus_map_number_td.innerHTML = "Bonus " + bonus_map.split(" ")[1];
            bonus_map_row.appendChild(bonus_map_name_td);
            bonus_map_row.appendChild(bonus_map_number_td);
            bonus_completions_tbody.appendChild(bonus_map_row);
        });
    }

    function update_bonus_completions() {
        // each tr has 2 td's, first is map name, second is the bonus number
        var bonus_table = document.querySelector('#DataTables_Table_2');
        var bonus_rows = bonus_table.rows;
        var bonus_maps = [];
        for (var i = 1; i < bonus_rows.length; i++) {
            var bonus_map = bonus_rows[i].cells[0].innerHTML;
            bonus_map = bonus_map.split(">")[1].split("<")[0];
            var bonus_number = bonus_rows[i].cells[1].innerHTML;
            bonus_number = bonus_number.split(" ")[1];
            bonus_map = bonus_map + " " + bonus_number;
            bonus_maps.push(bonus_map);
            var completions_txt = document.createElement('span');
            completions_txt.innerHTML = " " + bonus_completions[bonus_map] + " completions";
            completions_txt.style.color = "#949BA2";
            completions_txt.style.float = "right";
            completions_txt.style.marginRight = "15%";
            if (has_fetched) {
                if (bonus_rows[i].cells[0].innerHTML.includes("completions")) return;
                bonus_rows[i].cells[0].appendChild(completions_txt);
            }
        }
    }

    function country_code_to_flag_url(country_code) {
        var url = ("https://surfheaven.eu/flags/" + countryISOMapping(country_code) + ".svg").toLowerCase();
        if (url == "https://surfheaven.eu/flags/undefined.svg") url = "https://upload.wikimedia.org/wikipedia/commons/2/2a/Flag_of_None.svg"
        return url;
    }

    function countryISOMapping(country_code, reverse = false) {
        // https://github.com/vtex/country-iso-3-to-2/blob/master/index.js
        var countryISOMap = {
            AFG: "AF",ALA: "AX",ALB: "AL",DZA: "DZ",ASM: "AS",AND: "AD",AGO: "AO",AIA: "AI",ATA: "AQ",ATG: "AG",ARG: "AR",ARM: "AM",ABW: "AW",AUS: "AU",
            AUT: "AT",AZE: "AZ",BHS: "BS",BHR: "BH",BGD: "BD",BRB: "BB",BLR: "BY",BEL: "BE",BLZ: "BZ",BEN: "BJ",BMU: "BM",BTN: "BT",BOL: "BO",BES: "BQ",
            BIH: "BA",BWA: "BW",BVT: "BV",BRA: "BR",VGB: "VG",IOT: "IO",BRN: "BN",BGR: "BG",BFA: "BF",BDI: "BI",KHM: "KH",CMR: "CM",CAN: "CA",CPV: "CV",
            CYM: "KY",CAF: "CF",TCD: "TD",CHL: "CL",CHN: "CN",HKG: "HK",MAC: "MO",CXR: "CX",CCK: "CC",COL: "CO",COM: "KM",COG: "CG",COD: "CD",COK: "CK",
            CRI: "CR",CIV: "CI",HRV: "HR",CUB: "CU",CUW: "CW",CYP: "CY",CZE: "CZ",DNK: "DK",DJI: "DJ",DMA: "DM",DOM: "DO",ECU: "EC",EGY: "EG",SLV: "SV",
            GNQ: "GQ",ERI: "ER",EST: "EE",ETH: "ET",FLK: "FK",FRO: "FO",FJI: "FJ",FIN: "FI",FRA: "FR",GUF: "GF",PYF: "PF",ATF: "TF",GAB: "GA",GMB: "GM",
            GEO: "GE",DEU: "DE",GHA: "GH",GIB: "GI",GRC: "GR",GRL: "GL",GRD: "GD",GLP: "GP",GUM: "GU",GTM: "GT",GGY: "GG",GIN: "GN",GNB: "GW",GUY: "GY",
            HTI: "HT",HMD: "HM",VAT: "VA",HND: "HN",HUN: "HU",ISL: "IS",IND: "IN",IDN: "ID",IRN: "IR",IRQ: "IQ",IRL: "IE",IMN: "IM",ISR: "IL",ITA: "IT",
            JAM: "JM",JPN: "JP",JEY: "JE",JOR: "JO",KAZ: "KZ",KEN: "KE",KIR: "KI",PRK: "KP",KOR: "KR",KWT: "KW",KGZ: "KG",LAO: "LA",LVA: "LV",LBN: "LB",
            LSO: "LS",LBR: "LR",LBY: "LY",LIE: "LI",LTU: "LT",LUX: "LU",MKD: "MK",MDG: "MG",MWI: "MW",MYS: "MY",MDV: "MV",MLI: "ML",MLT: "MT",MHL: "MH",
            MTQ: "MQ",MRT: "MR",MUS: "MU",MYT: "YT",MEX: "MX",FSM: "FM",MDA: "MD",MCO: "MC",MNG: "MN",MNE: "ME",MSR: "MS",MAR: "MA",MOZ: "MZ",MMR: "MM",
            NAM: "NA",NRU: "NR",NPL: "NP",NLD: "NL",ANT: "AN",NCL: "NC",NZL: "NZ",NIC: "NI",NER: "NE",NGA: "NG",NIU: "NU",NFK: "NF",MNP: "MP",NOR: "NO",
            OMN: "OM",PAK: "PK",PLW: "PW",PSE: "PS",PAN: "PA",PNG: "PG",PRY: "PY",PER: "PE",PHL: "PH",PCN: "PN",POL: "PL",PRT: "PT",PRI: "PR",QAT: "QA",
            REU: "RE",ROU: "RO",RUS: "RU",RWA: "RW",BLM: "BL",SHN: "SH",KNA: "KN",LCA: "LC",MAF: "MF",SPM: "PM",VCT: "VC",WSM: "WS",SMR: "SM",STP: "ST",
            SAU: "SA",SEN: "SN",SRB: "RS",SYC: "SC",SLE: "SL",SGP: "SG",SXM: "SX",SVK: "SK",SVN: "SI",SLB: "SB",SOM: "SO",ZAF: "ZA",SGS: "GS",SSD: "SS",
            ESP: "ES",LKA: "LK",SDN: "SD",SUR: "SR",SJM: "SJ",SWZ: "SZ",SWE: "SE",CHE: "CH",SYR: "SY",TWN: "TW",TJK: "TJ",TZA: "TZ",THA: "TH",TLS: "TL",
            TGO: "TG",TKL: "TK",TON: "TO",TTO: "TT",TUN: "TN",TUR: "TR",TKM: "TM",TCA: "TC",TUV: "TV",UGA: "UG",UKR: "UA",ARE: "AE",GBR: "GB",USA: "US",
            UMI: "UM",URY: "UY",UZB: "UZ",VUT: "VU",VEN: "VE",VNM: "VN",VIR: "VI",WLF: "WF",ESH: "EH",YEM: "YE",ZMB: "ZM",ZWE: "ZW",XKX: "XK",XK: "XK"
        }
        if (reverse) {
            return Object.keys(countryISOMap).find(key => countryISOMap[key] === country_code)
        }
        return countryISOMap[country_code];
    }

    function fetch_ranks(id) {
        make_request("https://api.surfheaven.eu/api/records/" + id + "/", (records) => {
          make_request("https://api.surfheaven.eu/api/servers", (servers) => {
            if(Array.isArray(servers)) {
                servers = servers.filter(server => server.id !== 14); // Remove mayhem server
                const table = document.querySelector('.table');
                table.removeAttribute('title');

                table.rows[0].insertCell(3).outerHTML = "<th>Rank</th>";
                table.rows[0].insertCell(4).outerHTML = "<th>Bonus</th>";

                const rowsCount = Math.max(servers.length, table.rows.length - 1); 

                const rank_cells = Array(rowsCount).fill().map((_, i) => {
                if (table.rows[i + 1]) {
                    return table.rows[i + 1].insertCell(3);
                }
                });
        
                const bonus_cells = Array(rowsCount).fill().map((_, i) => {
                if (table.rows[i + 1]) {
                    return table.rows[i + 1].insertCell(4);
                }
                });
        
                const server_records = {};
                records.forEach((record) => {
                const record_found = servers.findIndex(server => server.map === record.map) >= 0;
                if (record_found) {
                    if (server_records[record.map] === undefined) {
                        server_records[record.map] = new Array(13);
                    }
                    server_records[record.map][record.track] = record;
                }
                });
        
                servers.forEach((server, i) => {
                    if(server.mapinfo){
                        var rec = server_records[server.map];
                        if (rec) { 
                            const map_record = rec[0];
                            if (map_record) { 
                                const txt = document.createTextNode(map_record.rank + " / " + server.mapinfo.completions);
                            if (rank_cells[i]) {
                                rank_cells[i].appendChild(txt);
                            }
                            } else { 
                                const txt = document.createTextNode("0 / " + server.mapinfo.completions);
                                if (rank_cells[i]) {
                                    rank_cells[i].appendChild(txt);
                                }
                            }
                
                            const bonus_completes = rec.reduce((value, record) => record && record.track > 0 ? value + 1 : value, 0);
                            const txt2 = document.createTextNode(bonus_completes + " / " + server.mapinfo.bonus);
                            if (bonus_cells[i]) {
                                bonus_cells[i].appendChild(txt2);
                            }
                        } else {
                            const txt = document.createTextNode("0 / " + server.mapinfo.completions);
                                if (rank_cells[i]) {
                                    rank_cells[i].appendChild(txt);
                                }
                
                            const txt_2 = document.createTextNode("0 / " + server.mapinfo.bonus);
                                if (bonus_cells[i]) {
                                    bonus_cells[i].appendChild(txt_2);
                                }
                        }
                    }
                });
        
                document.querySelector('.my-checkbox').disabled = false;
        
                fetch_bonus_ranks(id, servers, server_records);
            }
          });
        });
      }

    function fetch_bonus_ranks(id, servers, server_records) {
        const table = document.querySelector('.table');

        make_request("https://api.surfheaven.eu/api/completions", (completions) => {
            servers.forEach((server, server_index) => {
                try{
                    // eslint-disable-next-line no-unused-vars
                    // const server_completions = completions.filter(completion => completion.map === server.map && completion.track > 0);
                    const server_completions_2 = Array(15).fill(null);
                    completions.forEach(completion => {
                        if (completion.map === server.map && completion.track > 0) {
                            server_completions_2[completion.track] = completion;

                        }
                    });

                    const records = server_records[server.map];

                    const row = table.rows[server_index + 1];
                    const div = document.createElement('div');
                    div.className = "hidden-row";
                    div.style.display = row.cells[0].children[1].style.display;
                    const div_2 = document.createElement('div');
                    div_2.className = "hidden-row";
                    div_2.style.display = row.cells[0].children[1].style.display;

                    row.cells[2].appendChild(div_2);
                    row.cells[3].appendChild(div);

                    server_completions_2.forEach((completion) => {
                        if (completion === null) {
                            return;
                        }

                        var rank_text;
                        const h5_elem = document.createElement('p');
                        h5_elem.style = "margin-top: 10px;margin-bottom: 10px;font-size: 14px;font-family: inherit;display: block;   margin-inline-start: 0px;margin-inline-end: 0px;line-height: 1.1; text-align: end;";
                        h5_elem.textContent = `Bonus ${completion.track}`;

                        if (!records || !records[completion.track]) {
                            rank_text = `0 / ${completion.completions}`
                        } else {
                            rank_text = `${records[completion.track].rank} / ${completion.completions}`
                            h5_elem.textContent = `Bonus ${completion.track}`;
                        }

                        const rank_elem = document.createElement('p');
                        rank_elem.style = "margin-top: 10px;margin-bottom: 10px;font-size: 14px;font-family: inherit;display: block;   margin-inline-start: 0px;margin-inline-end: 0px;line-height: 1.1;";
                        rank_elem.textContent = rank_text;
                        div_2.appendChild(h5_elem);
                        div.appendChild(rank_elem);
                    });
                }
                catch(e){
                    //we dont give a fuck about errors (for now :D)
                    //console.log(e);
                }
            });

        });
    }

    function auto_fetch_ranks() {
        make_request("https://api.surfheaven.eu/api/id", (data) => {
            const id = data[0].steamid;
            fetch_ranks(id);
        });
    }

    function follow_user(id) {
        let follow_list = unsafeWindow.localStorage.getItem("follow_list");
        if (follow_list == null) {
            unsafeWindow.localStorage.setItem("follow_list", id + ",");
        } else {
            if (follow_list.includes(id)) {
                console.log('Unfollowing user ' + id)
                follow_list = follow_list.replace(id + ",", "");
            } else {
                console.log('Following user ' + id)
                follow_list += id + ",";
            }
            unsafeWindow.localStorage.setItem("follow_list", follow_list);
        }
        refresh_follow_list();
    }

    function get_follow_list() {
        let follow_list = unsafeWindow.localStorage.getItem("follow_list");
        if (follow_list == null) {
            return [];
        } else {
            follow_list = follow_list.slice(0, -1);
            return follow_list.split(",");
        }
    }

    function dashboard_page() {
        if(!settings.country_top_100) return;
        // CTOP Panel
        // this shit is such a mess
        make_request("https://api.surfheaven.eu/api/playerinfo/" + get_id() + "/", (c) => {
            var country = ""
            if (unsafeWindow.localStorage.getItem("country") == null) {
                country = c[0].country_code;
                unsafeWindow.localStorage.setItem("country", country);
            } else {
                country = unsafeWindow.localStorage.getItem("country");
            }
            make_request("https://api.surfheaven.eu/api/ctop/" + country + "/100", (data) => {
                var ctop_100 = []
                for (var i = 0; i < data.length; i++) {
                    ctop_100[i] = [data[i].name, data[i].points, data[i].rank, data[i].steamid];
                }
                var target_div = document.querySelector('.content > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1)');
                var top_players_div = target_div.querySelector('.content > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1)');
                var top_wr_holders_div = target_div.querySelector('.content > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2)');
                var ctop_root_div = document.createElement('div');
                var ctop_panel_div = document.createElement('div');
                var ctop_panel_heading_div = document.createElement('div');
                var ctop_table = document.createElement('table');
                var ctop_panel_body_div = document.createElement('div');
                var ctop_thead = document.createElement('thead');
                var ctop_tbody = document.createElement('tbody');
                var ctop_head_row = document.createElement('tr');
                var ctop_th_crank = document.createElement('th');
                var ctop_th_grank = document.createElement('th');
                var ctop_th_name = document.createElement('th');
                var ctop_th_points = document.createElement('th');
                var thirds_class = "col-lg-4 col-md-4 col-sm-12 col-xs-12"

                top_players_div.className = thirds_class;
                top_wr_holders_div.className = thirds_class;
                ctop_root_div.className = thirds_class;
                ctop_panel_div.className = "panel panel-filled";
                ctop_panel_heading_div.className = "panel-heading";
                ctop_panel_heading_div.style = "padding-bottom:0px; padding-top:6px; padding-left:6px;";
                ctop_panel_body_div.className = "panel-body";
                ctop_panel_body_div.style = "display: block; margin-bottom: 0px;";
                ctop_table.className = "table table-striped table-hover";
                ctop_table.id = "ctop_table";
                ctop_th_crank.innerHTML = country + " #";
                ctop_th_grank.innerHTML = "#";
                ctop_th_name.innerHTML = "Name";
                ctop_th_points.innerHTML = "Points";
                ctop_head_row.appendChild(ctop_th_crank);
                ctop_head_row.appendChild(ctop_th_grank);
                ctop_head_row.appendChild(ctop_th_name);
                ctop_head_row.appendChild(ctop_th_points);
                ctop_thead.appendChild(ctop_head_row);
                for (var j = 0; j < ctop_100.length; j++) {

                    var row_container = document.createElement('tr');
                    var crank_td = document.createElement('td');
                    var grank_td = document.createElement('td');
                    var name_td = document.createElement('td');
                    var name_a = document.createElement('a');
                    var points_td = document.createElement('td');

                    crank_td.innerHTML = j + 1;
                    grank_td.innerHTML = ctop_100[j][2];
                    name_a.innerHTML = ctop_100[j][0];
                    name_a.href = "https://surfheaven.eu/player/" + ctop_100[j][3];
                    points_td.innerHTML = ctop_100[j][1];

                    name_td.appendChild(name_a);
                    row_container.appendChild(crank_td);
                    row_container.appendChild(grank_td);
                    row_container.appendChild(name_td);
                    row_container.appendChild(points_td);
                    ctop_tbody.appendChild(row_container);
                }
                ctop_table.appendChild(ctop_thead);
                ctop_table.appendChild(ctop_tbody);
                ctop_panel_body_div.appendChild(ctop_table);

                var ctop_title_text = document.createElement('span');
                ctop_title_text.innerHTML = " TOP 100";

                ctop_panel_heading_div.appendChild(ctop_title_text);
                ctop_panel_div.appendChild(ctop_panel_heading_div);
                ctop_panel_div.appendChild(ctop_panel_body_div);
                ctop_root_div.appendChild(ctop_panel_div);

                top_wr_holders_div.parentNode.insertBefore(ctop_root_div, top_wr_holders_div);
                $(document).ready(function () {
                    $('#ctop_table').DataTable({
                        "ordering": true,
                        "pagingType": "simple",
                        "info": false,
                        "searching": true,
                        "lengthChange": false,
                        "oLanguage": {
                            "sSearch": '<i class="fas fa-search"></i>'
                        }
                    });
                    insert_flags_to_profiles();
                    add_country_dropdown();
                })
            });
        });
    }

    function servers_page() {
        make_navbar_compact();
        var my_div = document.createElement('div');
        my_div.className = 'navbar-form custom-id-div';
        var my_list = document.createElement('ul');
        my_list.className = "nav luna-nav";
        var idLabel1 = document.createElement('li');
        idLabel1.innerHTML = '<a>ID</a>';
        var switchButton = document.createElement('li');
        switchButton.innerHTML = '<label class="switch"><input class="my-checkbox" type="checkbox"><span class="slider"></span><span class="labels" data-on="MANUAL" data-off="AUTO"></span></label>';
        my_list.appendChild(idLabel1);
        my_list.appendChild(switchButton);
        my_div.appendChild(my_list);
        var navbar = document.getElementById('navbar')
        navbar.appendChild(my_div);
        var checkbox = document.querySelector('.my-checkbox')
        checkbox.onchange = handle_checkbox;
        if (use_custom) {
            checkbox.click()
        } else {
            auto_fetch_ranks();
        }

        // Empty server queue
        let queue_button = document.createElement('button');
        queue_button.className = 'btn btn-success btn-lg';
        queue_button.innerHTML = 'Queue for empty server';
        queue_button.style = 'margin-top: 10px;';
        let auto_join_checkbox = document.createElement('input');
        auto_join_checkbox.type = 'checkbox';
        auto_join_checkbox.id = 'auto_join_checkbox';
        auto_join_checkbox.checked = true;
        let auto_join_label = document.createElement('label');
        auto_join_label.htmlFor = 'auto_join_checkbox';
        auto_join_label.innerHTML = 'Auto-join';
        document.querySelector('.panel-heading').appendChild(document.createElement('br'));
        document.querySelector('.panel-heading').appendChild(queue_button);
        document.querySelector('.panel-heading').appendChild(document.createElement('br'));
        document.querySelector('.panel-heading').appendChild(auto_join_checkbox);
        document.querySelector('.panel-heading').appendChild(auto_join_label);
        queue_button.onclick = function () {
            let region = document.getElementById("region_select").value;
            queue_for_empty_server(region);
            queue_button.innerHTML = '<i class="fa fa-spinner fa-pulse fa-lg fa-fw"></i> Queueing...  (click to cancel)';
            queue_button.classList = 'btn btn-danger btn-lg';
            queue_button.onclick = function () {
                window.location.reload();
            }
        }

        function queue_for_empty_server(region){
            let found = false;
            let check_delay = 5000;
            const region_map = {
                "Global": "ALL",
                "Germany": "EU",
                "Australia": "AU"
            }
            let region_code = region_map[region];

            make_request('https://api.surfheaven.eu/api/servers', function (data) {
                for (let i = 0; i < data.length; i++) {
                    if (data[i].players.length == 0 && !data[i].ip.includes('mayhem')) {
                        if (region_code == "ALL" || data[i].region == region_code) {
                            queue_button.disabled = false;
                            queue_button.innerHTML = 'Queue for empty server';
                            queue_button.classList = 'btn btn-success btn-lg';
                            found = true;
                            console.log('Found empty server: ' + data[i].name + ' (' + data[i].ip + ')');
                            if(auto_join_checkbox.checked){
                                window.location.href = 'steam://connect/' + data[i].ip;
                                alert('Found empty server: ' + data[i].name + ' (' + data[i].ip + ')');
                            }else{
                                if(window.confirm('Found empty server: ' + data[i].name + ' (' + data[i].ip + ')\nPress OK to join')){
                                    window.location.href = 'steam://connect/' + data[i].ip;
                                }
                            }
                            window.location.reload();
                            break;
                        }
                    }
                }
                if(!found){
                    console.log('No empty servers found');
                    setTimeout(queue_for_empty_server, check_delay);
                }
            });
        }
    }

    function profile_page() {
        var steam_profile_url = document.querySelector('.m-t-xs > a:nth-child(2)') == null ? document.querySelector('.m-t-xs > a:nth-child(1)').href : document.querySelector('.m-t-xs > a:nth-child(2)').href;
        var current_profile_id = url_path[url_path.length - 1];
        const username_h2 = document.querySelector('.m-t-xs');
        username_h2.appendChild(document.createElement('br'));

        if(settings.follow_list){
            var follow_button = document.createElement('button');
            if (get_follow_list().includes(current_profile_id)) {
                follow_button.className = 'btn btn-danger btn-xs';
                follow_button.innerHTML = '<i class="fas fa-user-times"></i> Unfollow';
                follow_button.title = 'Unfollow';
            } else {
                follow_button.className = 'btn btn-success btn-xs';
                follow_button.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
                follow_button.title = 'Follow';
            }
            follow_button.onclick = function () {
                follow_user(current_profile_id);
                if (get_follow_list().includes(current_profile_id)) {
                    follow_button.className = 'btn btn-danger btn-xs';
                    follow_button.innerHTML = '<i class="fas fa-user-times"></i> Unfollow';
                    follow_button.title = 'Unfollow';
                } else {
                    follow_button.className = 'btn btn-success btn-xs';
                    follow_button.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
                    follow_button.title = 'Follow';
                }
            };
            follow_button.style = 'margin-right: 5px;';
            username_h2.appendChild(follow_button);
        }

        // Gift Vip button, only if user is not vip, since some ppl have lifetime
        make_request('https://api.surfheaven.eu/api/playerinfo/' + current_profile_id, function (data) {
            if(data[0].vip != true){
                const gift_vip_button = document.createElement('button');
                gift_vip_button.className = 'btn btn-success btn-xs';
                get_id() == current_profile_id ? gift_vip_button.innerHTML = "<i class='fab fa-paypal'></i> Buy vip" : gift_vip_button.innerHTML = "<i class='fa fa-gift'></i> Gift VIP";
                gift_vip_button.onclick = function () {
                    gift_vip(steam_profile_url.split('/')[steam_profile_url.split('/').length - 1])
                };
                let gift_vip_target_div = document.querySelector('.m-t-xs');
                gift_vip_target_div.appendChild(gift_vip_button);
            }
        });

        insert_steam_avatar(steam_profile_url);
        fetch_country_rank(current_profile_id);
        fetch_completions_of_uncompleted_maps();
        fetch_time_spent(current_profile_id);
        completions_by_tier(current_profile_id);
        insert_points_until_next_rank();

        const compare_button = document.createElement('button');
        compare_button.className = 'btn btn-success btn-xs';
        compare_button.innerHTML = "Compare";
        compare_button.onclick = function () {
            player_comparison([get_id(), current_profile_id]);
        };
        let compare_target_div = document.querySelector('div.col-sm-12:nth-child(3) > div:nth-child(1) > div:nth-child(1)');
        compare_target_div.insertBefore(compare_button, compare_target_div.children[1]);

        // total points from map completions
        let map_points = 0;
        make_request("https://api.surfheaven.eu/api/records/"+current_profile_id+"/track", function (data) {
            for(let i = 0; i < data.length; i++){
                map_points += data[i].points;
            }
            var stats_table = document.querySelector('.medium > tbody:nth-child(1)');
            var stats_table_rows = stats_table.children;
            var points_td = document.createElement('td');
            points_td.innerHTML = '<strong class="c-white">'+map_points+'</strong> Points from map completions';
            stats_table_rows[4].appendChild(points_td);

        });

        // common uncompleted maps button
        if(current_profile_id != get_id()){
            let common_uncompleted_maps_button = document.createElement('button');
            common_uncompleted_maps_button.className = 'btn btn-success btn-xs';
            common_uncompleted_maps_button.id = "common_uncompleted_maps_button";
            common_uncompleted_maps_button.innerHTML = "Filter to mutual";
            common_uncompleted_maps_button.onclick = function () {
                player_comparison([get_id(), current_profile_id], true);
                // dirty hack until proper fix
                setTimeout(function () {
                    player_comparison([get_id(), current_profile_id], true);
                }, 500);
                setTimeout(function () {
                    player_comparison([get_id(), current_profile_id], true);
                }, 500);
            };
            let common_uncompleted_maps_target_div = document.querySelector('div.col-sm-12:nth-child(4) > div:nth-child(1) > div:nth-child(1)');
            common_uncompleted_maps_target_div.insertBefore(common_uncompleted_maps_button, common_uncompleted_maps_target_div.children[1]);
        }

        // uncompleted maps table
        $('#DataTables_Table_1').on('draw.dt', function () {
            update_map_completions();
        });
        // uncompleted bonuses table
        $('#DataTables_Table_2').on('draw.dt', function () {
            update_bonus_completions();
        });
        // SORTING BY COMPLETIONS
        var sort_completions_button = document.createElement('button');
        sort_completions_button.className = 'btn btn-success btn-xs';
        var order_arrow_direction = "▼"; // ↓ or ↑;
        sort_completions_button.innerHTML = "Sort by completions " + order_arrow_direction;
        sort_completions_button.style = "margin-right: 10px;padding-right: 10px;";
        var sort_map_completions_order = "desc";
        var sort_bonus_completions_order = "desc";

        sort_completions_button.onclick = function () {
            // show all rows in the table MUST BE DONE otherwise only the 10 visible rows will be sorted
            var table = $('#DataTables_Table_1').DataTable();
            table.page.len(-1).draw()
            sort_map_completions(sort_map_completions_order);
            // scrollbar
            var table_div = document.querySelector('#DataTables_Table_1_wrapper');
            table_div.style = "overflow-y: scroll; height: 500px;"
            sort_map_completions_order = sort_map_completions_order == "asc" ? "desc" : "asc";
            // Arrow dir
            order_arrow_direction = sort_map_completions_order == "asc" ? "▲" : "▼";
            sort_completions_button.innerHTML = "Sort by completions " + order_arrow_direction;
        }
        $('#DataTables_Table_1_filter').prepend(sort_completions_button);
        // Bonus table
        var sort_completions_button_b = document.createElement('button');
        sort_completions_button_b.className = 'btn btn-success btn-xs';
        sort_completions_button_b.innerHTML = "Sort by completions ▼";
        sort_completions_button_b.style = "margin-right: 10px;";
        sort_completions_button_b.onclick = function () {
            var table = $('#DataTables_Table_2').DataTable();
            table.page.len(-1).draw()
            sort_bonus_completions(sort_bonus_completions_order);
            var table_div = document.querySelector('#DataTables_Table_2_wrapper');
            table_div.style = "overflow-y: scroll; height: 500px;"
            sort_bonus_completions_order = sort_bonus_completions_order == "asc" ? "desc" : "asc";
            order_arrow_direction = sort_bonus_completions_order == "asc" ? "▲" : "▼";
            sort_completions_button_b.innerHTML = "Sort by completions " + order_arrow_direction;
        }
        $('#DataTables_Table_2_filter').prepend(sort_completions_button_b);

    }

    function player_comparison(id_array, find_common_uncompleted = false){
        let player_data = [];
        for(let i = 0; i < id_array.length; i++){
            if(!find_common_uncompleted){
                make_request(`https://api.surfheaven.eu/api/records/${id_array[i]}/`, (data) => {
                    let only_maps = [];
                    for(let i = 0; i < data.length; i++){
                        if(data[i].track == 0){
                            only_maps.push(data[i]);
                        }
                    }
                    player_data.push(only_maps);
                    if(player_data.length == id_array.length){
                        create_comparison_table(player_data);
                    }
                });
            }else{
                let table = $('#DataTables_Table_1').DataTable({retrieve: true});
                table.page.len(-1).draw();
                make_request(`https://api.surfheaven.eu/api/uncompleted/${id_array[i]}/`, (data) => {
                    let only_maps = [];
                    for(let i = 0; i < data.length; i++){
                        if(data[i].track == 0){
                            only_maps.push(data[i].map);
                        }
                    }
                    player_data.push(only_maps);
                    if(player_data.length == id_array.length){
                        // find common uncompleted maps
                        let common_maps = [];
                        player_data[0].forEach((map) => {
                            if(player_data[1].find((map2) => map2 === map)){
                                common_maps.push([map]);
                            }
                        });
                        for(let x = 0; x < 2; x++){ // double pass
                            for(let i = 0; i < table.rows().count(); i++){
                                let map_name = table.row(i).data()[0].match(/(?<=<a href="\/map\/)[^"]+/)[0];
                                let found = false;
                                for(let j = 0; j < common_maps.length; j++){
                                    if(map_name == common_maps[j][0]){
                                        found = true;
                                        break;
                                    }
                                }
                                if(!found){
                                    table.row(i).remove();
                                }
                            }
                            table.page.len(10).draw();
                        }
                    }
                });
            }
        }

        function create_comparison_table(player_data){
            let common_maps = [];
            let p1_name = player_data[0][0].name;
            let p2_name = player_data[1][0].name;
            for(let i = 0; i < player_data[0].length; i++){
                for(let j = 0; j < player_data[1].length; j++){
                    if(player_data[0][i].map == player_data[1][j].map){
                        let map_data = [];
                        map_data.push([player_data[0][i].map,player_data[0][i].tier, player_data[0][i].rank, player_data[0][i].points, player_data[1][j].rank, player_data[1][j].points])
                        common_maps.push(map_data);
                    }
                }
            }
            let container = document.createElement('div');
            container.className = "container";
            let table = document.createElement('table');
            table.className = "table";
            let thead = document.createElement('thead');
            thead.innerHTML = `<tr><th>Map</th><th>Tier</th><th>${p1_name}'s rank</th><th>Points</th><th>${p2_name}'s rank</th><th>Points</th></tr>`;
            table.appendChild(thead);
            let tbody = document.createElement('tbody');
            for(let i = 0; i < common_maps.length; i++){
                let tr = document.createElement('tr');
                let td = document.createElement('td');
                td.innerHTML = `<a href="https://surfheaven.eu/map/${common_maps[i][0][0]}">${common_maps[i][0][0]}</a>`;
                tr.appendChild(td);
                td = document.createElement('td');
                td.innerHTML = common_maps[i][0][1];
                tr.appendChild(td);
                td = document.createElement('td');
                td.innerHTML = common_maps[i][0][2];
                tr.appendChild(td);
                td = document.createElement('td');
                td.innerHTML = common_maps[i][0][3];
                tr.appendChild(td);
                td = document.createElement('td');
                td.innerHTML = common_maps[i][0][4];
                tr.appendChild(td);
                td = document.createElement('td');
                td.innerHTML = common_maps[i][0][5];
                tr.appendChild(td);
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            container.appendChild(table);
            $(table).DataTable(
                {
                    "order": [[1, "desc"]],
                    "autoWidth": true,
                    "paging": true,
                    "searching": true,
                    "info": true,
                    "lengthMenu": [10, 20]
                }
            );
            show_overlay_window("Map comparison",container);
        }
    }

    function map_page(current_map_name) {
        // padding fix to not cut off the shadows
        let padding_fix = document.querySelector('.media');
        padding_fix.style = "padding-left: 10px; margin-top: 0px;";
        document.querySelector('.pe').remove(); // removing the map icon to free some vertical space

        map_youtube_link(current_map_name);
        fetch_map_rank(current_map_name);
        cp_chart();
        insert_map_picture(current_map_name);
        insert_points_per_rank(current_map_name);
        insert_map_page_tag_list(current_map_name);

    }

    function insert_map_page_tag_list(current_map_name){
        let tag_container = document.createElement('div');
        tag_container.className = "container-fluid";
        tag_container.style = "padding-left: 0px; padding-right: 0px;";
        document.querySelector('.media').appendChild(tag_container);
        let curr_row = 0;
        let max_tags_per_row = 5;

        let tag_row = document.createElement('div');
        tag_row.className = "row";

        let control_row = document.createElement('div');
        control_row.className = "row";

        let tag_col = document.createElement('div');
        tag_col.class = "tags";

        let tag_add_link = document.createElement('a');
        tag_add_link.className = "outlined";
        tag_add_link.innerHTML = "Manage tags";
        tag_add_link.style.cursor = "pointer";
        tag_add_link.onclick = () => {
            open_tag_selection_window(current_map_name, true);
        }

        let tags = get_tags(current_map_name);
        for(let i = 0; i < tags.length; i++){
            let tag = document.createElement('span');
            tag.style.whiteSpace = "pre-wrap";
            tag.style.cursor = "default";
            tag.className = "tag";
            tag.innerHTML = tags[i];
            append_to_last_row(tag);
        }

        tag_row.appendChild(tag_col);
        tag_container.appendChild(tag_row);
        control_row.appendChild(tag_add_link);
        tag_container.appendChild(control_row);

        function append_to_last_row(tag){
            let target_div = document.querySelectorAll('.container-fluid')[2];
            curr_row = Math.floor(target_div.getElementsByClassName("tag").length / max_tags_per_row);
            if(target_div.getElementsByClassName("tags")[curr_row] == undefined){
                let row = document.createElement('div');
                row.className = "tags";
                target_div.appendChild(row);
            }
            target_div.getElementsByClassName("tags")[curr_row].appendChild(tag);
        }
    }

    function add_tag(map_name, tag){
        let tags = get_tags(map_name);
        if(!tags.includes(tag)){
            tags.push(tag);
            set_map_tags(map_name, tags);
            console.log(`added tag ${tag} to map ${map_name}`)
        }
        else{
            console.log(`tag ${tag} already exists on map ${map_name}`)
        } 

    }

    function remove_tag(map_name, tag){
        let tags = get_tags(map_name);
        let index = tags.indexOf(tag);
        if(index > -1){
            tags.splice(index, 1);
        }
        if(tags.length == 0){
            let db = get_tag_db();
            delete db[map_name];
            save_tag_db(db);
        }else{
            set_map_tags(map_name, tags);
            console.log(`removed tag ${tag} from map ${map_name}`)
        }
    }

    function get_tag_db(){
        let db = unsafeWindow.localStorage.getItem("map_tags");
        if(db == null){
            db = {};
        }else{
            db = JSON.parse(db);
        }
        return db;
    }

    function rename_tag(old_tag, new_tag){
        let db = get_tag_db();
        for(let map_name in db){
            let tags = db[map_name];
            let index = tags.indexOf(old_tag);
            if(index > -1){
                tags[index] = new_tag;
                db[map_name] = tags;
            }
        }
        save_tag_db(db);
    }

    function save_tag_db(db){
        for(let map_name in db){
            db[map_name].sort();
        }
        unsafeWindow.localStorage.setItem("map_tags", JSON.stringify(db));
        console.log("saved db")
    }

    function set_map_tags(map_name, tags){
        let db = get_tag_db();
        if(tags.length == 0){
            delete db[map_name];
            console.log(`no tags remaining for ${map_name}, deleting entry`)
        }else{
            tags.sort();
            db[map_name] = tags;
            console.log(`saved tags ${tags} for ${map_name}`)
        }
        save_tag_db(db);

    }

    function get_tags(map_name){
        let db = get_tag_db();
        let tags = db[map_name];
        if(tags == null){
            tags = [];
        }
        console.log(`got tags ${tags} for ${map_name}`)
        return tags.sort();
    }

    function get_maps_with_tag(tag){
        let db = get_tag_db();
        let maps = [];
        for(let key in db){
            if(db[key].includes(tag)){
                maps.push(key);
            }
        }
        console.log(`got maps ${maps} with tag ${tag}`)
        return maps;
    }

    function get_all_tags_from_db(){
        let db = get_tag_db();
        let tags = [];
        for(let key in db){
            for(let i = 0; i < db[key].length; i++){
                if(!tags.includes(db[key][i])){
                    tags.push(db[key][i]);
                }
            }
        }
        console.log(`got all tags ${tags} from db`)
        tags.sort();
        return tags;
    }

    function purge_all_tags(){
        if(window.confirm("Are you sure you want to purge all tags?")){
            let db = {};
            save_tag_db(db);
            console.log("purged all tags")
            window.location.reload();
        }
    }

    /**
     * Backs up all tags as a JSON file
     */
    function export_all_tags(){
        let db = get_tag_db();
        console.log("saving all tags as json file")
        download(JSON.stringify(db), "surfheaven_map_tags_backup.json", "text/plain");
    }

    /**
     * Exports maps with a specific tag as a JSON file
     * @param {Array} tags array of tags
     */
    function export_specific_tags(tags){
        for(let i = 0; i < tags.length; i++){
            let tag = tags[i];
            let maps = get_maps_with_tag(tag);
            let json = {};
            json[tag] = maps;
            console.log(`saving maps ${maps} with tag ${tag} as json file`)
            download(JSON.stringify(json), `${tag}_maps.json`, "text/plain");
        }
    }

    /**
     * Imports tags from a JSON file and updates the tag database
     */
    function import_tags(){
        let file_input = document.createElement('input');
        file_input.type = "file";
        file_input.accept = ".json";
        file_input.onchange = (e) => {
            console.log("importing tags")
            let file = e.target.files[0];
            console.log(file)
            let reader = new FileReader();
            reader.onload = (e) => {
                let db = JSON.parse(e.target.result);
                console.log(db)
                let old_db = get_tag_db();
                // key is the tag, value is the maps
                for(let key in db){
                    console.log(`importing tag ${key}`)
                    let maps = db[key];
                    for(let i = 0; i < maps.length; i++){
                        if(old_db[maps[i]] != undefined){
                            console.log(`adding tag ${key} to map ${maps[i]}`)
                            let map = maps[i];
                            let tags = get_tags(map);
                            if(!tags.includes(key)){
                                tags.push(key);
                                set_map_tags(map, tags);
                            }
                        }else{
                            console.log(`adding map ${maps[i]} with tag ${key}`)
                            set_map_tags(maps[i], [key]);
                        }
                    }        
                    console.log("imported tags")
                    document.getElementById('overlay').remove();
                    open_map_tag_menu();
                }
            }; 
            reader.readAsText(file);

        }
        file_input.dispatchEvent(new MouseEvent('click'));
    }

    function download(content, fileName, contentType) {
        var a = document.createElement("a");
        var file = new Blob([content], {type: contentType});
        a.href = URL.createObjectURL(file);
        a.download = fileName;
        a.click();
    }

    function open_map_tag_menu(){
        let root_div = document.createElement('div');
        root_div.classList = "container-fluid";

        let table_wrapper = document.createElement('div');
        table_wrapper.style = "overflow-y: auto; overflow-x: hidden;";

        table_wrapper.style.maxHeight = "600px";
        table_wrapper.style.minHeight = "600px";
        let map_tag_table = document.createElement('table');
        map_tag_table.classList.add('table', 'table-striped', 'table-hover');

        let map_tag_table_head = document.createElement('thead');
        let map_tag_table_body = document.createElement('tbody');

        map_tag_table_head.innerHTML = `<tr><th>Map</th><th>Tags</th></tr>`;

        let db = get_tag_db();
        for(let map in db){
            let row = document.createElement('tr');
            let map_name = document.createElement('td');
            map_name.innerHTML = `<a href="https://surfheaven.eu/map/${map}">${map}</a>`;
            let tags = document.createElement('td');
            tags.innerHTML = db[map].join(', ');
            row.appendChild(map_name);
            row.appendChild(tags);
            map_tag_table_body.appendChild(row);
            
        }
        map_tag_table.appendChild(map_tag_table_head);
        map_tag_table.appendChild(map_tag_table_body);
        map_tag_table.style.minWidth = "600px";


        let table = $(map_tag_table).DataTable({
            "columns": [
                { "width": "35%" },
                { "width": "65%" }
            ],
            "autoWidth": false,
            "paging": false,
            "searching": true,
        });

        let tag_links = document.createElement('div');
        tag_links.className = "row";
        tag_links.style.paddingBottom = "10px";
        tag_links.style.paddingLeft = "10px";
        tag_links.style.paddingRight = "10px";
        tag_links.style.flexWrap = "wrap";

        let all_tags = get_all_tags_from_db();
        for(let i = 0; i < all_tags.length; i++){
            let tag_link = document.createElement('a');
            tag_link.className = "tag";
            tag_link.innerHTML = all_tags[i];
            tag_link.onclick = () => {
                if(tag_link.classList.contains("tag-selected")){
                    tag_link.classList.remove("tag-selected");
                }else{
                    tag_link.classList.add("tag-selected");
                }
                let selected_tags = tag_links.getElementsByClassName("tag-selected");

                if(selected_tags.length == 0){
                    export_button.style.display = "none";
                    rename_button.style.display = "none";
                }
                else if(selected_tags.length == 1){
                    export_button.style.display = "inline-block";
                    rename_button.style.display = "inline-block";
                }else{
                    export_button.style.display = "inline-block";
                    rename_button.style.display = "none";
                }
                    
                let tag_array = [];
                let regex = "";
                for(let i = 0; i < selected_tags.length; i++){
                    tag_array.push(selected_tags[i].innerHTML);

                }
                let tag_regex_pattern = tag_array.map((tag) => {
                    return `(?=.*${tag}\\b)`;
                }).join("");
                regex = `^${tag_regex_pattern}.*$`;
                table.column(1).search(regex,true).draw();

            }
            function append_to_last_row(tag){
                let max_tags_per_row = 12;
                let last_row = tag_links.lastElementChild;
                if(last_row == null || last_row.childElementCount == max_tags_per_row){
                    let new_row = document.createElement('div');
                    new_row.className = "row";
                    new_row.style.marginBottom = "10px";
                    tag_links.appendChild(new_row);
                    last_row = new_row;
                }
                last_row.appendChild(tag);
            }
            append_to_last_row(tag_link);
        }
        let filter_text = document.createElement('p');
        filter_text.innerHTML = "Filter by tags: ";

        let import_button = document.createElement('button');
        import_button.className = "btn btn-primary";
        import_button.style.marginTop = "10px";
        import_button.style.marginRight = "10px";
        import_button.innerHTML = "Import tag";
        import_button.onclick = () => {
            import_tags();
        }

        let export_button = document.createElement('button');
        export_button.className = "btn btn-primary";
        export_button.innerHTML = "Export tag(s)";
        export_button.style.display = "none";
        export_button.style.marginTop = "10px";
        export_button.onclick = () => {
            let selected_tags = tag_links.getElementsByClassName("tag-selected");
            let tag_array = [];
            for(let i = 0; i < selected_tags.length; i++){
                tag_array.push(selected_tags[i].innerHTML);
            }
            export_specific_tags(tag_array);
        }

        let rename_button = document.createElement('button');
        rename_button.className = "btn btn-primary";
        rename_button.innerHTML = "Rename tag";
        rename_button.style.marginTop = "10px";
        rename_button.style.marginLeft = "10px";
        rename_button.style.display = "none";
        rename_button.onclick = () => {
            let selected_tags = tag_links.getElementsByClassName("tag-selected");
            if(selected_tags.length == 1){
                let tag = selected_tags[0].innerHTML;
                let new_tag = prompt("Enter new tag name",tag);
                if(new_tag != null && new_tag != ""){
                    rename_tag(tag,new_tag);
                    selected_tags[0].innerHTML = new_tag;

                    let rows = map_tag_table_body.getElementsByTagName('tr');
                    for(let i = 0; i < rows.length; i++){
                        let tags = rows[i].getElementsByTagName('td')[1].innerHTML;
                        tags = tags.replace(tag,new_tag);
                        rows[i].getElementsByTagName('td')[1].innerHTML = tags;
                    }
                }
            }
        }


        let button_wrapper = document.createElement('div');
        button_wrapper.className = "row";
        button_wrapper.style.paddingBottom = "10px";
        button_wrapper.style.paddingLeft = "10px";
        button_wrapper.style.paddingRight = "10px";
        button_wrapper.appendChild(import_button);
        button_wrapper.appendChild(export_button);
        button_wrapper.appendChild(rename_button);

        root_div.appendChild(filter_text);
        root_div.appendChild(tag_links);
        table_wrapper.appendChild(map_tag_table);
        root_div.appendChild(table_wrapper);
        root_div.appendChild(button_wrapper);
        
        show_overlay_window("Map tags",root_div);
    }

    function open_tag_selection_window(map_name, from_map_page = false){
        if(document.getElementById("tag_selection_modal") != null){
            $('#tag_selection_modal').modal('show');
        }else{
            let modal = document.createElement('div');
            modal.innerHTML = `<div class="modal fade" id="tag_selection_modal" tabindex="-1" role="dialog" style="display: flex;">
            <div class="modal-dialog" role="document">
                <div class="modal-content">
                    <div class="modal-body" style="padding: 1rem;">
                    <div class="container-fluid">
                        <h4>Select tags</h4>
                        <div class="row"></div>
                    </div>
                    </div>
                    <div class="modal-footer" style="padding:7px;">
                        <button type="button" class="btn btn-secondary btn-danger" data-dismiss="modal">Cancel</button>
                        <button type="button" id="set_tags" class="btn btn-primary btn-success">Set tags</button>
                    </div>
                </div>
            </div>
        </div>`;
            document.body.appendChild(modal);

            let db = get_tag_db();
            let all_tags = get_all_tags_from_db();
            let curr_row = 0; // current row in modal
            let max_tags_per_row = 12;
            for(let i = 0; i < all_tags.length; i++){
                let tag = document.createElement('a');
                tag.className = "tag";
                tag.innerHTML = all_tags[i];
                if(from_map_page){
                    if((map_name in db)){
                        if(db[map_name].includes(all_tags[i])){
                            tag.classList.add("tag-selected");
                        }
                    }
                }
                tag.onclick = () => {
                    if(tag.classList.contains("tag-selected")){
                        tag.classList.remove("tag-selected");
                    }else{
                        tag.classList.add("tag-selected");
                    }
                }
                append_to_last_row(tag)
            }

            // custom tag input
            let input_wrapper = document.createElement('div');
            input_wrapper.style.display = "flex";
            input_wrapper.style.alignItems = "center";
            input_wrapper.style.marginTop = "20px";

            let tag_input = document.createElement('input');
            tag_input.type = "text";
            tag_input.placeholder = "Enter tag";
            tag_input.className = "form-control";
            tag_input.style.marginBottom = "10px";
            tag_input.style.width = "120px";

            let create_tag_button = document.createElement('button');

            create_tag_button.className = "btn btn-primary";
            create_tag_button.style.marginLeft = "5px";
            create_tag_button.style.marginBottom = "10px";
            create_tag_button.innerHTML = "Create tag";
            create_tag_button.onclick = () => {
                // add tag to selection grid
                if(tag_input.value != "" && tag_input.value != " "){
                    let tag = document.createElement('a');
                    tag.className = "tag tag-selected";
                    tag.style.whiteSpace = "nowrap";
                    tag.innerHTML = tag_input.value;
                    tag.onclick = () => {
                        if(tag.classList.contains("tag-selected")){
                            tag.classList.remove("tag-selected");
                        }else{
                            tag.classList.add("tag-selected");
                        }
                    }
                    append_to_last_row(tag)
                    tag_input.value = "";
                }
            }
            input_wrapper.appendChild(tag_input);
            input_wrapper.appendChild(create_tag_button);
            modal.getElementsByClassName("modal-body")[0].appendChild(input_wrapper);

            modal.getElementsByClassName("modal-footer")[0].getElementsByClassName("btn-primary")[0].onclick = () => {
                let selected_tags = modal.getElementsByClassName("tag-selected");
                let _tags = [];
                for(let i = 0; i < selected_tags.length; i++){
                    let tag = selected_tags[i].innerHTML;
                    _tags.push(tag)
                }
                set_map_tags(map_name,_tags)
                // add the tags to the map
                if(from_map_page){
                    let map_tags_div = document.getElementsByClassName("tags")[0];
                    if(map_tags_div == undefined){
                        map_tags_div = document.createElement('div');
                        map_tags_div.className = "tags";
                        document.getElementsByClassName("container-fluid")[2].appendChild(map_tags_div);
                    }
                    map_tags_div.innerHTML = "";
                    for(let i = 0; i < _tags.length; i++){
                        let tag = document.createElement('a');
                        tag.className = "tag";
                        tag.innerHTML = _tags[i];
                        map_tags_div.appendChild(tag);
                    }
                }
                $('#tag_selection_modal').modal('hide');
            }

            $('#tag_selection_modal').modal('show');
            function append_to_last_row(tag){
                curr_row = Math.floor(modal.getElementsByClassName("tag").length / max_tags_per_row);
                if(modal.getElementsByClassName("row")[curr_row] == undefined){
                    let row = document.createElement('div');
                    row.className = "row";
                    row.style.marginTop = "10px";
                    modal.getElementsByClassName("container-fluid")[0].appendChild(row);
                }
                modal.getElementsByClassName("row")[curr_row].appendChild(tag);
            }
        }

    }

    function insert_points_until_next_rank(){
        const points_regex = /Points (\d+)/;
        const rank_regex = /Rank (\d+)/;
        const own_points = Number(document.body.innerText.match(points_regex)[1])
        const own_rank = Number(document.body.innerText.match(rank_regex)[1])

        if (own_rank == 1){
            console.log("Already #1 :)");
            return;
        }

        function find_next_rank(rank){
            let count = 0;
            for(let i = 0; i < GROUP_THRESHOLDS.length; i++){
                if(GROUP_THRESHOLDS[i] < rank) count++;
            }
            return GROUP_THRESHOLDS[count-1];
        };

        let next_rank = find_next_rank(own_rank);
        let points_until_next_rank = 0;

        make_request("https://api.surfheaven.eu/api/rank/"+next_rank, function(data){
            let next_rank_points = data[0].points;
            points_until_next_rank = next_rank_points - own_points;
            console.log(`Points until next rank: ${points_until_next_rank}`);
            let points_until_next_rank_element = document.createElement('h5');
            points_until_next_rank_element.innerHTML = `
            Points needed for [<span style="color: ${GROUP_COLORS[GROUP_THRESHOLDS.indexOf(next_rank)]}">${[GROUP_NAMES[GROUP_THRESHOLDS.indexOf(next_rank)]]}</span>] : ${points_until_next_rank}`;
            let insert_after = document.querySelector('.media > h5:nth-child(4)');
            insert_after.parentNode.insertBefore(points_until_next_rank_element, insert_after.nextSibling);

        });
    }

    function insert_points_per_rank(map_name){
        // will error out if cp_chart is disabled, due to the queryselectors being wrong, perhaps i need to switch to finding the elements with regex instead
        if(!settings.points_per_rank) return;
        let total_completions_element

        if(settings.map_cover_image){total_completions_element = document.querySelector('table.table:nth-child(2) > tbody:nth-child(2) > tr:nth-child(2) > td:nth-child(2) > strong:nth-child(2)')}
        else{total_completions_element = document.querySelector('table.table-responsive > tbody:nth-child(1) > tr:nth-child(1) > td:nth-child(1) > strong:nth-child(1)')}

        let last_rank = Number(total_completions_element.textContent)
        let ranks = [1,2,3,10,15,25,50,100,250,500,1000,last_rank];
        let points = [];
        let count = 0;
        for (let i = 0; i < ranks.length; i++) {
            if (ranks[i] >= last_rank) {
              break;
            }
            count++;
          }

        ranks = ranks.slice(0, count);
        ranks.push(last_rank);

        for(let i = 0; i < ranks.length; i++){
            make_request("https://api.surfheaven.eu/api/maprank/"+map_name+"/"+ranks[i]+"/0", function(data){
                points.push(data[0].points);
            });
        }
        // make_request isnt async so we need to wait for /some time/ before we can start using the data
        setTimeout(function(){
            points.sort(function(a, b){return b-a});
            //console.log(points,ranks)

            let table = document.createElement('table');
            table.className = "text-white";
            table.style = "width: 100%;";

            for (let i = 0; i < Math.ceil(ranks.length/2); i++) {
                let row = table.insertRow(i);
                if(points[i] != undefined){
                    let cell1 = row.insertCell(0);
                    cell1.innerHTML = `#<strong class="c-white">${ranks[i]}: ${points[i]}</strong> pts`;
                }
                if(points[i+Math.ceil(points.length/2)] != undefined){
                    let cell2 = row.insertCell(1);
                    cell2.innerHTML = `#<strong class="c-white">${ranks[i+Math.ceil(points.length/2)]}: ${points[i+Math.ceil(points.length/2)]}</strong> pts`;
                }

            }
            let table_body = document.createElement('tbody');
            let target_div = (settings.map_cover_image ? document.querySelector('div.col-md-3:nth-child(4)') : document.querySelector('div.col-md-3:nth-child(2)'));
            let upper_table =(settings.map_cover_image ? document.querySelector('table.table:nth-child(2)') : document.querySelector('table.table-responsive')) ;
            let table_title = document.createElement('h4');

            upper_table.style = "margin-top: 0px; margin-bottom: 0px;";
            table_title.style = "margin-top: 0px; margin-bottom: 5px;text-align: center;";
            table_title.textContent = "Points per rank";
            target_div.appendChild(table_title);
            table.appendChild(table_body);
            target_div.appendChild(table);

            add_shadow_to_text_recursively(target_div);
        }, 1500);

    }

    function insert_map_picture(map_name){
        if(!settings.map_cover_image) return;
        let map_link = "https://github.com/Sayt123/SurfMapPics/raw/Maps-and-bonuses/csgo/"+map_name+".jpg"

        let target_div = document.querySelector('.panel-c-warning');
        target_div.style = "background: url('"+map_link+"'); background-position: center;background-repeat: no-repeat;background-size: cover;";
        if(target_div.style.backgroundImage != "none"){
            add_shadow_to_text_recursively(target_div);
        }
        let col_1;
        let col_2;
        let col_3;
        if(settings.cp_chart){
            col_1 = document.querySelector('div.col-md-3:nth-child(2)');
            col_2 = document.querySelector('div.col-md-3:nth-child(4)');
            col_3 = document.querySelector('.col-md-5');
        }else{
            col_1 = document.querySelector('div.col-sm-6');
            col_2 = document.querySelector('.col-md-5');
        }
        col_1.classList.add("text-center")
        col_2.classList.add("text-center")
        col_1.style = "background-color: rgba(0, 0, 0, 0.4); margin-right: 4.15%; border-radius: 1rem; height: 300px; box-shadow: 0px 2px 0px 0px #f6a821;";
        col_2.style = "background-color: rgba(0, 0, 0, 0.4); margin-right: 4.15%; border-radius: 1rem; height: 300px; box-shadow: 0px 2px 0px 0px #f6a821;";
        if(settings.cp_chart) col_3.style = "background-color: rgba(0, 0, 0, 0.4); border-radius: 1rem; height: 300px; box-shadow: 0px 2px 0px 0px #f6a821;";
    }

    function add_shadow_to_text_recursively(element) {
        if (!settings.map_cover_image) return;
        if (element.nodeType === Node.TEXT_NODE) {
            const span = document.createElement('span');
            span.style.fontWeight = 'bold';
            span.style.textShadow = '1px 0px black, 0px 1px black, -1px 0px black, 0px -1px black, 1px 1px black, 1px -1px black, -1px 1px black, -1px -1px black';
            span.textContent = element.textContent;
            element.parentNode.replaceChild(span, element);
        } else {
            element.childNodes?.forEach(childNode => {
                add_shadow_to_text_recursively(childNode);
            });
        }
    }

    function cp_chart() {
        if(!settings.cp_chart) return;
        var top_panel_row = document.querySelector('.panel-c-warning > div:nth-child(1) > div:nth-child(1)')
        var map_info_col = document.querySelector('.panel-c-warning > div:nth-child(1) > div:nth-child(1) > div:nth-child(1)')
        var map_stats_col = document.querySelector('.panel-c-warning > div:nth-child(1) > div:nth-child(1) > div:nth-child(2)')
        var cp_chart_col = document.createElement('div');
        cp_chart_col.className = "col-md-5 ct-chart";
        map_info_col.className = "col-md-3";
        map_stats_col.className = "col-md-3";
        top_panel_row.appendChild(cp_chart_col);

        make_request('https://api.surfheaven.eu/api/checkpoints/' + current_map_name, function (data) {
            var cp_labels = ["Start"];
            var cp_series = [0];
            var own_series = [];
            var all_series = [cp_series, own_series];
            var cp_chart = new Chartist.Line('.ct-chart', {
                labels: cp_labels,
                series: []
            }, {
                fullWidth: true,
                height: 300,
                chartPadding: {
                    right: 40
                }
            })
            for (var i = 0; i < data.length; i++) {
                if (data[i].time != 0) {
                    cp_labels.push((i == data.length - 1 ? "End" : "CP" + (i + 1)));
                    cp_series.push(data[i].time);
                }
            }
            cp_chart.update({
                series: [cp_series],
                labels: cp_labels
            });
            cp_chart.on('draw', function () {
                add_shadow_to_text_recursively(cp_chart_col)
            });
            // if we are WR (🥳), we can skip checking our own time again
            if (data[0].steamid != get_id()) {
                make_request('https://api.surfheaven.eu/api/checkpoints/' + current_map_name + '/' + get_id(), function (data2) {
                    if (data2.length != 0) {
                        own_series = [0];
                        for (var i = 0; i < data2.length; i++) {
                            if (data2[i].time != 0) {
                                own_series.push(data2[i].time);
                            };
                            var diff = (own_series[i] - cp_series[i]).toFixed(2);
                            // sometimes the api returns checkpoints with missing times, fun
                            if (i != 0 && i < data2.length - 1 && !isNaN(diff)) cp_labels[i] = (diff > 0 ? "+" : "") + diff ;
                        }
                        // manually adding diff to the end, because mysteriously sometimes it's not added,
                        // and after i manually add it, sometimes its added twice, but still only visible once??? maybe im retarded, maybe its maybeline
                        var end_diff = (own_series[own_series.length - 1] - cp_series[cp_series.length - 1]).toFixed(2);
                        end_diff = (end_diff > 0 ? "+" : "") + end_diff;
                        cp_labels[cp_labels.length - 1] = end_diff;
                        console.log(cp_series, own_series, cp_labels)
                        all_series.push(own_series)
                        console.log(all_series)
                        cp_chart.update({
                            series: all_series,
                            labels: cp_labels
                        });
                    }
                });
            }

            let records_table
            let target_div = document.querySelectorAll('div.col')
            let correct_div = target_div[target_div.length -1]
            let table_div = correct_div.querySelector('div.table-responsive.table-maps')
            let table = table_div.childNodes[1]

            records_table = table.querySelectorAll('a')

            let first_page = true
            add_chart_buttons();

            function add_chart_buttons (){
                records_table.forEach((a_element, i) => {
                    let button_element = document.createElement('button');
                    button_element.className = 'btn btn-success btn-xs'
                    button_element.textContent = 'Add to chart';
                    button_element.style.float = 'right';
                    if (i == 0 && first_page) button_element.style.display = 'none';
                    first_page = false;
                    let link = a_element.href.split('/')
                    let id = link[link.length - 1]
                    if (id == get_id()) button_element.style.display = 'none';
                    if (a_element.nextElementSibling) return;
                    if(!a_element.href.includes('#')) a_element.insertAdjacentElement('afterend', button_element);
                    button_element.onclick = function () {
                        make_request('https://api.surfheaven.eu/api/checkpoints/' + current_map_name + '/' + id, function (data3) {
                            var new_series = [0];
                            for (var i = 0; i < data3.length; i++) {
                                if (data3[i].time != 0) {
                                    new_series.push(data3[i].time);
                                };
                            }
                            all_series.push(new_series);
                            cp_chart.update({
                                series: all_series,
                                labels: cp_labels
                            });
                        });
                        button_element.style.display = 'none';
                    }
                });
            }

            $(table).on('draw.dt', function () {
                records_table = table.querySelectorAll('a')
                add_chart_buttons();
              });
        });

    }

    function insert_steam_avatar(steam_profile_url) {
        if(!settings.steam_avatar) return;
        GM_xmlhttpRequest({
            method: 'GET',
            url: '/inc/getSteam.php?u=' + steam_profile_url,
            responseType: 'json',
            onload: function (response) {
                if (response.status == 200) {
                    var image_full = response.response.Image.replace(".jpg", "_full.jpg");
                    var image_with_style = image_full.replace("/>", "style='border-radius: 5px;margin-right:10px;float:left;' />");
                    var media_div = document.querySelector('.media');
                    media_div.insertAdjacentHTML('afterbegin', image_with_style);
                    var profile_icon = document.querySelector('.pe-7s-user');
                    profile_icon.remove();
                } else {
                    console.log("Error getting steam avatar: " + response.status);
                }
            }
        })
    }

    function open_settings_menu() {
        const settings_div = document.createElement("div");
        settings_div.style.padding = "1rem";

        let settings_row = document.createElement("div");
        settings_row.classList.add("row");
        settings_row.style.minWidth = "400px";
        let category_count = 0;
        for(let category in settings_categories) {
            const settings_column = document.createElement("div");
            settings_column.classList.add("col-md-6");

            const category_div = document.createElement("div");
            const category_h4 = document.createElement("h4");
            category_h4.style.textDecoration = "underline";
            category_h4.textContent = category;
            category_div.appendChild(category_h4);

            for(let setting of settings_categories[category]) {
                const label = document.createElement('label');
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.id = setting;
                input.name = 'settings';
                input.checked = settings[setting];
                label.appendChild(input);
                label.appendChild(document.createTextNode(" "+settings_labels[setting]));
                category_div.appendChild(label);
                category_div.appendChild(document.createElement('br'));
            }
            settings_column.appendChild(category_div);
            settings_row.appendChild(settings_column);
            category_count++;
            if(category_count % 2 == 0) {
                settings_div.appendChild(settings_row);
                settings_row = document.createElement("div");
                settings_row.classList.add("row");
                settings_row.style.minWidth = "400px";
            }
        }
        settings_div.appendChild(settings_row);
        
        //save settings
        const save_settings_button = document.createElement("button");
        save_settings_button.classList.add("btn", "btn-sm", "btn-success");
        save_settings_button.textContent = "Save settings";
        save_settings_button.style.marginTop = "1rem";
        save_settings_button.style.marginBottom = "1rem";
        settings_div.appendChild(save_settings_button);

        const backup_everything_button = document.createElement("button");
        backup_everything_button.classList.add("btn", "btn-sm", "btn-success");
        backup_everything_button.textContent = "Backup everything";
        backup_everything_button.style.marginTop = "1rem";
        backup_everything_button.style.marginBottom = "1rem";
        backup_everything_button.style.marginLeft = "1rem";
        settings_div.appendChild(backup_everything_button);

        const restore_backup_button = document.createElement("button");
        restore_backup_button.classList.add("btn", "btn-sm", "btn-success");
        restore_backup_button.textContent = "Restore backup";
        restore_backup_button.style.marginTop = "1rem";
        restore_backup_button.style.marginBottom = "1rem";
        restore_backup_button.style.marginLeft = "1rem";
        settings_div.appendChild(restore_backup_button);

        restore_backup_button.onclick = () => {
            const file_input = document.createElement("input");
            file_input.type = "file";
            file_input.accept = ".json";
            file_input.onchange = (e) => {
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onload = (e) => {
                    unsafeWindow.localStorage.clear();
                    const data = JSON.parse(e.target.result);
                    for(let key in data) {
                        unsafeWindow.localStorage.setItem(key, data[key]);

                    }
                    window.location.reload();
                }
                reader.readAsText(file);
            }
            file_input.click();
        }
        
        backup_everything_button.onclick = () => {
            download(JSON.stringify(localStorage), "surfheaven_extended_settings.json", "text/plain");
        }

        save_settings_button.onclick = () => {
            const checkboxes = document.querySelectorAll('input[name=settings]');
            console.log(checkboxes);
            checkboxes.forEach((checkbox) => {
                settings[checkbox.id] = checkbox.checked;
            });
            unsafeWindow.localStorage.setItem("settings", JSON.stringify(settings));
            window.location.reload();
        }

        settings_div.appendChild(document.createElement('hr'));

        // purge flags
        const purge_flags_button = document.createElement("button");
        purge_flags_button.classList.add("btn", "btn-sm", "btn-primary");
        purge_flags_button.textContent = "Purge flags cache";
        purge_flags_button.onclick = purge_flags_cache
        settings_div.appendChild(document.createElement('br'));
        settings_div.appendChild(purge_flags_button);

        // purge maps
        const purge_maps_button = document.createElement("button");
        purge_maps_button.classList.add("btn", "btn-sm", "btn-primary");
        purge_maps_button.textContent = "Purge map tags";
        purge_maps_button.style.marginLeft = "1rem";
        purge_maps_button.onclick = purge_all_tags
        settings_div.appendChild(purge_maps_button);
        settings_div.appendChild(document.createElement('br'));

        // backup and import tags buttons
        const backup_tags_button = document.createElement("button");
        backup_tags_button.classList.add("btn", "btn-sm", "btn-primary");
        backup_tags_button.textContent = "Backup tags";
        backup_tags_button.onclick = export_all_tags
        const backup_tags_text = document.createElement("h5");
        backup_tags_text.textContent = "Backup tags to file";
        settings_div.appendChild(backup_tags_text);
        settings_div.appendChild(backup_tags_button);

        //h4 for import tags
        const import_tags_h5 = document.createElement("h5");
        import_tags_h5.textContent = "Load tags from backup";
        settings_div.appendChild(import_tags_h5);

        let import_button = document.createElement('input');
        import_button.type = "file";
        import_button.accept = ".json";
        import_button.id 
        import_button.className = "btn btn-primary";
        import_button.innerHTML = "Import tags";
        import_button.onchange = () => {
            let file = import_button.files[0];
            let reader = new FileReader();
            reader.onload = (e) => {
                let db = JSON.parse(e.target.result);
                save_tag_db(db);
                console.log("Imported tags");
                window.location.reload();
            }
            reader.readAsText(file);
        }
        settings_div.appendChild(import_button);

        // Localstorage size out of ~5MB
        let localstorage_size_p = document.createElement("p");
        localstorage_size_p.style.marginTop = "0.5rem";
        let localstorage_size_text = () => {
            let total = 0;
            for (let key in localStorage) {
              if (localStorage.hasOwnProperty(key)) {
                total += (localStorage[key].length + key.length) * 2; // each character is 2 bytes
              }
            }
            return (total / 1024).toFixed(2) + " KB";
            //return ((new Blob(Object.values(localStorage)).size + new Blob(Object.keys(localStorage)).size) / 1024).toFixed(2) + " KB"; 
            //neither of the sizes are correct, probably due to encoding differences, but the first way overshoots a bit so it's better
        }
        localstorage_size_p.textContent = "Localstorage size: " + localstorage_size_text() + "  / ~5MB";
        settings_div.appendChild(localstorage_size_p);

        // api call count
        let api_call_count_p = document.createElement("p");
        api_call_count_p.textContent = "API calls: " + api_call_count;
        settings_div.appendChild(api_call_count_p);
        
        //changelog title
        const changelog_title = document.createElement("h5");
        changelog_title.textContent = "Changelog";
        settings_div.appendChild(changelog_title);
        //changelog textbox
        const changelog_textbox = document.createElement("textarea");
        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://raw.githubusercontent.com/Kalekki/SurfHeaven_Extended/main/changelog.txt',
            onload: function (response) {
                if (response.status == 200) {
                    changelog_textbox.textContent = response.responseText;
                } else {
                    console.log("Error getting changelog: " + response.status);
                }
            }
        });
        changelog_textbox.classList.add("form-control");
        changelog_textbox.style.height = "150px";
        changelog_textbox.style.width = "100%";
        changelog_textbox.style.resize = "none";
        changelog_textbox.setAttribute("readonly", "");
        settings_div.appendChild(changelog_textbox);

        //footer
        const settings_footer = document.createElement("div");

        const version_button = document.createElement("button");
        version_button.title = "Check for updates";
        version_button.classList.add("btn", "btn-xs", "btn-primary");
        version_button.textContent = VERSION;
        version_button.onclick = () => {
            check_for_updates();
            document.getElementById("overlay_window").remove();
        }
        version_button.style.float = "right";
        settings_footer.appendChild(version_button);

        const footer_link = document.createElement("span");
        footer_link.style.color = "white";
        footer_link.innerHTML = `<i class="fab fa-github fa-lg"></i><a href="https://github.com/Kalekki/SurfHeaven_Extended" target="_blank" style="color:white;"> Drop me a star, will ya?</a>`;
        settings_footer.appendChild(footer_link);
        settings_footer.style.marginTop = "1rem";
        settings_div.appendChild(settings_footer);

        show_overlay_window("Settings",settings_div);
    }

    function gift_vip(steamid){
        unsafeWindow.localStorage.setItem('gift_vip_steamid', steamid);
        window.location.href = '/donate/';
    }

})();

GM_addStyle(`
    .ct-double-octave:after,.ct-golden-section:after,.ct-major-eleventh:after,.ct-major-second:after,.ct-major-seventh:after,.ct-major-sixth:after,.ct-major-tenth:after,.ct-major-third:after,.ct-major-twelfth:after,.ct-minor-second:after,.ct-minor-seventh:after,.ct-minor-sixth:after,.ct-minor-third:after,.ct-octave:after,.ct-perfect-fifth:after,.ct-perfect-fourth:after,.ct-square:after{content:"";clear:both}.ct-label{fill:#ffffff;color:#ffffff;font-size:1rem;line-height:1.41}.ct-chart-bar .ct-label,.ct-chart-line .ct-label{display:block;display:-webkit-box;display:-moz-box;display:-ms-flexbox;display:-webkit-flex;display:flex}.ct-chart-donut .ct-label,.ct-chart-pie .ct-label{dominant-baseline:central}.ct-label.ct-horizontal.ct-start{-webkit-box-align:flex-end;-webkit-align-items:flex-end;-ms-flex-align:flex-end;align-items:flex-end;-webkit-box-pack:flex-start;-webkit-justify-content:flex-start;-ms-flex-pack:flex-start;justify-content:flex-start;text-align:left;text-anchor:start}.ct-label.ct-horizontal.ct-end{-webkit-box-align:flex-start;-webkit-align-items:flex-start;-ms-flex-align:flex-start;align-items:flex-start;-webkit-box-pack:flex-start;-webkit-justify-content:flex-start;-ms-flex-pack:flex-start;justify-content:flex-start;text-align:left;text-anchor:start}.ct-label.ct-vertical.ct-start{-webkit-box-align:flex-end;-webkit-align-items:flex-end;-ms-flex-align:flex-end;align-items:flex-end;-webkit-box-pack:flex-end;-webkit-justify-content:flex-end;-ms-flex-pack:flex-end;justify-content:flex-end;text-align:right;text-anchor:end}.ct-label.ct-vertical.ct-end{-webkit-box-align:flex-end;-webkit-align-items:flex-end;-ms-flex-align:flex-end;align-items:flex-end;-webkit-box-pack:flex-start;-webkit-justify-content:flex-start;-ms-flex-pack:flex-start;justify-content:flex-start;text-align:left;text-anchor:start}.ct-chart-bar .ct-label.ct-horizontal.ct-start{-webkit-box-align:flex-end;-webkit-align-items:flex-end;-ms-flex-align:flex-end;align-items:flex-end;-webkit-box-pack:center;-webkit-justify-content:center;-ms-flex-pack:center;justify-content:center;text-align:center;text-anchor:start}.ct-chart-bar .ct-label.ct-horizontal.ct-end{-webkit-box-align:flex-start;-webkit-align-items:flex-start;-ms-flex-align:flex-start;align-items:flex-start;-webkit-box-pack:center;-webkit-justify-content:center;-ms-flex-pack:center;justify-content:center;text-align:center;text-anchor:start}.ct-chart-bar.ct-horizontal-bars .ct-label.ct-horizontal.ct-start{-webkit-box-align:flex-end;-webkit-align-items:flex-end;-ms-flex-align:flex-end;align-items:flex-end;-webkit-box-pack:flex-start;-webkit-justify-content:flex-start;-ms-flex-pack:flex-start;justify-content:flex-start;text-align:left;text-anchor:start}.ct-chart-bar.ct-horizontal-bars .ct-label.ct-horizontal.ct-end{-webkit-box-align:flex-start;-webkit-align-items:flex-start;-ms-flex-align:flex-start;align-items:flex-start;-webkit-box-pack:flex-start;-webkit-justify-content:flex-start;-ms-flex-pack:flex-start;justify-content:flex-start;text-align:left;text-anchor:start}.ct-chart-bar.ct-horizontal-bars .ct-label.ct-vertical.ct-start{-webkit-box-align:center;-webkit-align-items:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:flex-end;-webkit-justify-content:flex-end;-ms-flex-pack:flex-end;justify-content:flex-end;text-align:right;text-anchor:end}.ct-chart-bar.ct-horizontal-bars .ct-label.ct-vertical.ct-end{-webkit-box-align:center;-webkit-align-items:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:flex-start;-webkit-justify-content:flex-start;-ms-flex-pack:flex-start;justify-content:flex-start;text-align:left;text-anchor:end}.ct-grid{stroke:rgba(0,0,0,.2);stroke-width:1px;stroke-dasharray:2px}.ct-grid-background{fill:none}.ct-point{stroke-width:10px;stroke-linecap:round}.ct-line{fill:none;stroke-width:2px}.ct-area{stroke:none;fill-opacity:.1}.ct-bar{fill:none;stroke-width:10px}.ct-slice-donut{fill:none;stroke-width:60px}.ct-series-a .ct-bar,.ct-series-a .ct-line,.ct-series-a .ct-point,.ct-series-a .ct-slice-donut{stroke:#d70206}.ct-series-a .ct-area,.ct-series-a .ct-slice-donut-solid,.ct-series-a .ct-slice-pie{fill:#d70206}.ct-series-b .ct-bar,.ct-series-b .ct-line,.ct-series-b .ct-point,.ct-series-b .ct-slice-donut{stroke:#f05b4f}.ct-series-b .ct-area,.ct-series-b .ct-slice-donut-solid,.ct-series-b .ct-slice-pie{fill:#f05b4f}.ct-series-c .ct-bar,.ct-series-c .ct-line,.ct-series-c .ct-point,.ct-series-c .ct-slice-donut{stroke:#f4c63d}.ct-series-c .ct-area,.ct-series-c .ct-slice-donut-solid,.ct-series-c .ct-slice-pie{fill:#f4c63d}.ct-series-d .ct-bar,.ct-series-d .ct-line,.ct-series-d .ct-point,.ct-series-d .ct-slice-donut{stroke:#d17905}.ct-series-d .ct-area,.ct-series-d .ct-slice-donut-solid,.ct-series-d .ct-slice-pie{fill:#d17905}.ct-series-e .ct-bar,.ct-series-e .ct-line,.ct-series-e .ct-point,.ct-series-e .ct-slice-donut{stroke:#453d3f}.ct-series-e .ct-area,.ct-series-e .ct-slice-donut-solid,.ct-series-e .ct-slice-pie{fill:#453d3f}.ct-series-f .ct-bar,.ct-series-f .ct-line,.ct-series-f .ct-point,.ct-series-f .ct-slice-donut{stroke:#59922b}.ct-series-f .ct-area,.ct-series-f .ct-slice-donut-solid,.ct-series-f .ct-slice-pie{fill:#59922b}.ct-series-g .ct-bar,.ct-series-g .ct-line,.ct-series-g .ct-point,.ct-series-g .ct-slice-donut{stroke:#0544d3}.ct-series-g .ct-area,.ct-series-g .ct-slice-donut-solid,.ct-series-g .ct-slice-pie{fill:#0544d3}.ct-series-h .ct-bar,.ct-series-h .ct-line,.ct-series-h .ct-point,.ct-series-h .ct-slice-donut{stroke:#6b0392}.ct-series-h .ct-area,.ct-series-h .ct-slice-donut-solid,.ct-series-h .ct-slice-pie{fill:#6b0392}.ct-series-i .ct-bar,.ct-series-i .ct-line,.ct-series-i .ct-point,.ct-series-i .ct-slice-donut{stroke:#f05b4f}.ct-series-i .ct-area,.ct-series-i .ct-slice-donut-solid,.ct-series-i .ct-slice-pie{fill:#f05b4f}.ct-series-j .ct-bar,.ct-series-j .ct-line,.ct-series-j .ct-point,.ct-series-j .ct-slice-donut{stroke:#dda458}.ct-series-j .ct-area,.ct-series-j .ct-slice-donut-solid,.ct-series-j .ct-slice-pie{fill:#dda458}.ct-series-k .ct-bar,.ct-series-k .ct-line,.ct-series-k .ct-point,.ct-series-k .ct-slice-donut{stroke:#eacf7d}.ct-series-k .ct-area,.ct-series-k .ct-slice-donut-solid,.ct-series-k .ct-slice-pie{fill:#eacf7d}.ct-series-l .ct-bar,.ct-series-l .ct-line,.ct-series-l .ct-point,.ct-series-l .ct-slice-donut{stroke:#86797d}.ct-series-l .ct-area,.ct-series-l .ct-slice-donut-solid,.ct-series-l .ct-slice-pie{fill:#86797d}.ct-series-m .ct-bar,.ct-series-m .ct-line,.ct-series-m .ct-point,.ct-series-m .ct-slice-donut{stroke:#b2c326}.ct-series-m .ct-area,.ct-series-m .ct-slice-donut-solid,.ct-series-m .ct-slice-pie{fill:#b2c326}.ct-series-n .ct-bar,.ct-series-n .ct-line,.ct-series-n .ct-point,.ct-series-n .ct-slice-donut{stroke:#6188e2}.ct-series-n .ct-area,.ct-series-n .ct-slice-donut-solid,.ct-series-n .ct-slice-pie{fill:#6188e2}.ct-series-o .ct-bar,.ct-series-o .ct-line,.ct-series-o .ct-point,.ct-series-o .ct-slice-donut{stroke:#a748ca}.ct-series-o .ct-area,.ct-series-o .ct-slice-donut-solid,.ct-series-o .ct-slice-pie{fill:#a748ca}.ct-square{display:block;position:relative;width:100%}.ct-square:before{display:block;float:left;content:"";width:0;height:0;padding-bottom:100%}.ct-square:after{display:table}.ct-square>svg{display:block;position:absolute;top:0;left:0}.ct-minor-second{display:block;position:relative;width:100%}.ct-minor-second:before{display:block;float:left;content:"";width:0;height:0;padding-bottom:93.75%}.ct-minor-second:after{display:table}.ct-minor-second>svg{display:block;position:absolute;top:0;left:0}.ct-major-second{display:block;position:relative;width:100%}.ct-major-second:before{display:block;float:left;content:"";width:0;height:0;padding-bottom:88.8888888889%}.ct-major-second:after{display:table}.ct-major-second>svg{display:block;position:absolute;top:0;left:0}.ct-minor-third{display:block;position:relative;width:100%}.ct-minor-third:before{display:block;float:left;content:"";width:0;height:0;padding-bottom:83.3333333333%}.ct-minor-third:after{display:table}.ct-minor-third>svg{display:block;position:absolute;top:0;left:0}.ct-major-third{display:block;position:relative;width:100%}.ct-major-third:before{display:block;float:left;content:"";width:0;height:0;padding-bottom:80%}.ct-major-third:after{display:table}.ct-major-third>svg{display:block;position:absolute;top:0;left:0}.ct-perfect-fourth{display:block;position:relative;width:100%}.ct-perfect-fourth:before{display:block;float:left;content:"";width:0;height:0;padding-bottom:75%}.ct-perfect-fourth:after{display:table}.ct-perfect-fourth>svg{display:block;position:absolute;top:0;left:0}.ct-perfect-fifth{display:block;position:relative;width:100%}.ct-perfect-fifth:before{display:block;float:left;content:"";width:0;height:0;padding-bottom:66.6666666667%}.ct-perfect-fifth:after{display:table}.ct-perfect-fifth>svg{display:block;position:absolute;top:0;left:0}.ct-minor-sixth{display:block;position:relative;width:100%}.ct-minor-sixth:before{display:block;float:left;content:"";width:0;height:0;padding-bottom:62.5%}.ct-minor-sixth:after{display:table}.ct-minor-sixth>svg{display:block;position:absolute;top:0;left:0}.ct-golden-section{display:block;position:relative;width:100%}.ct-golden-section:before{display:block;float:left;content:"";width:0;height:0;padding-bottom:61.804697157%}.ct-golden-section:after{display:table}.ct-golden-section>svg{display:block;position:absolute;top:0;left:0}.ct-major-sixth{display:block;position:relative;width:100%}.ct-major-sixth:before{display:block;float:left;content:"";width:0;height:0;padding-bottom:60%}.ct-major-sixth:after{display:table}.ct-major-sixth>svg{display:block;position:absolute;top:0;left:0}.ct-minor-seventh{display:block;position:relative;width:100%}.ct-minor-seventh:before{display:block;float:left;content:"";width:0;height:0;padding-bottom:56.25%}.ct-minor-seventh:after{display:table}.ct-minor-seventh>svg{display:block;position:absolute;top:0;left:0}.ct-major-seventh{display:block;position:relative;width:100%}.ct-major-seventh:before{display:block;float:left;content:"";width:0;height:0;padding-bottom:53.3333333333%}.ct-major-seventh:after{display:table}.ct-major-seventh>svg{display:block;position:absolute;top:0;left:0}.ct-octave{display:block;position:relative;width:100%}.ct-octave:before{display:block;float:left;content:"";width:0;height:0;padding-bottom:50%}.ct-octave:after{display:table}.ct-octave>svg{display:block;position:absolute;top:0;left:0}.ct-major-tenth{display:block;position:relative;width:100%}.ct-major-tenth:before{display:block;float:left;content:"";width:0;height:0;padding-bottom:40%}.ct-major-tenth:after{display:table}.ct-major-tenth>svg{display:block;position:absolute;top:0;left:0}.ct-major-eleventh{display:block;position:relative;width:100%}.ct-major-eleventh:before{display:block;float:left;content:"";width:0;height:0;padding-bottom:37.5%}.ct-major-eleventh:after{display:table}.ct-major-eleventh>svg{display:block;position:absolute;top:0;left:0}.ct-major-twelfth{display:block;position:relative;width:100%}.ct-major-twelfth:before{display:block;float:left;content:"";width:0;height:0;padding-bottom:33.3333333333%}.ct-major-twelfth:after{display:table}.ct-major-twelfth>svg{display:block;position:absolute;top:0;left:0}.ct-double-octave{display:block;position:relative;width:100%}.ct-double-octave:before{display:block;float:left;content:"";width:0;height:0;padding-bottom:25%}.ct-double-octave:after{display:table}.ct-double-octave>svg{display:block;position:absolute;top:0;left:0}

    .luna-nav.nav li>label{
        padding: 8px 15px 8px 25px;
        margin: 0;
        margin-left: 10px;
    }

    .switch {
        position: relative;
        display: inline-block;
        width: 90px;
        height: 34px;
    }

    .switch input {
        opacity: 0;
        width: 0;
        height: 0;
    }
    .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: #ccc;
        -webkit-transition: .4s;
        transition: .4s;
    }

    .slider:before {
        position: absolute;
        content: "";
        height: 26px;
        width: 26px;
        left: 4px;
        bottom: 4px;
        background-color: white;
        -webkit-transition: .4s;
        transition: .4s;
    }

    input:checked + .slider {
        background-color: #f6a821;
    }

    input:focus + .slider {
        box-shadow: 0 0 1px #2196F3;
    }

    input:checked + .slider:before {
        -webkit-transform: translateX(56px);
        -ms-transform: translateX(56px);
        transform: translateX(56px);
    }

    .switch .labels {
        position: absolute;
        top: 8px;
        left: 0;
        width: 100%;
        height: 100%;
        font-size: 12px;
        font-family: sans-serif;
        transition: all 0.4s ease-in-out;
    }

    .switch .labels::after {
        content: attr(data-off);
        position: absolute;
        right: 5px;
        color: #4d4d4d;
        opacity: 1;
        text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.4);
        transition: all 0.4s ease-in-out;
    }

    .switch .labels::before {
        content: attr(data-on);
        position: absolute;
        left: 5px;
        color: #ffffff;
        opacity: 0;
        text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.4);
        transition: all 0.4s ease-in-out;
    }

    .switch input:checked~.labels::after {
        opacity: 0;
    }

    .switch input:checked~.labels::before {
        opacity: 1;
    }

    .settings-div {
        background-color: #0D1117;
    }

    #hover-div{
        position: absolute;
        background-color: rgba(13,17,23,0.6);
        white-space: nowrap;
        width: auto;
        border: 1px solid black;
        border-radius: 0.5rem;
        padding-top: 0px;
        padding-bottom: 0px;
        padding-left: 10px;
        padding-right: 10px;
        pointer-events:none;
        //display: none;
        opacity: 0;
        //transition: opacity 0.5s;
        animation: fadeOut 0.5s;
    }
    #hover-div.show{
        display: block;
        opacity: 1;
        animation: fadeIn 0.5s;
        z-index: 100;
        pointer-events:none;
    }

    @keyframes fadeIn {
        0% { opacity: 0;}
        100% { opacity: 1;}
    }
    @keyframes fadeOut {
        0% { opacity: 1;}
        100% {opacity: 0;}
    }
    .ct-grid{
        stroke: #606577;
        stroke-dasharray: 0, 0;
    }

    .ct-series-a .ct-line,
    .ct-series-a .ct-point {
        stroke: lightgreen;
    }

    .ct-series-b .ct-line,
    .ct-series-b .ct-point {
        stroke: blue;
    }

    .ct-series-c .ct-line,
    .ct-series-c .ct-point {
        stroke: red;
    }

    .ct-series-d .ct-line,
    .ct-series-d .ct-point {
        stroke: yellow;
    }
    .ct-series-e .ct-line,
    .ct-series-e .ct-point {
        stroke: cyan;
    }
    .ct-series-a .ct-bar {
        stroke: CornflowerBlue;
        stroke-width: 20px;
    }
    .ct-series-b .ct-bar {
        stroke: DarkSeaGreen;
        stroke-width: 14px;
    }
    .tag{
        background-color: darkgray;
        border-radius: 1rem;
        padding: 0.2rem 0.5rem;
        margin: 0.2rem 0.5rem 0.3rem 0.5rem;
        margin-bottom: 0.3rem;
        color: black;
        
    }
    .tag:hover{
        color: black;
        cursor: pointer;
        text-decoration: none;
    }
    .tag-selected{
        background-color: #47cf52;
    }
    .outlined {
        //color: white;
        text-shadow:
          -1px -1px 0 #000,
           0   -1px 0 #000,
           1px -1px 0 #000,
           1px  0   0 #000,
           1px  1px 0 #000,
           0    1px 0 #000,
          -1px  1px 0 #000,
          -1px  0   0 #000;
    }
    .outlined-medium {
        //color: white;
        text-shadow:
          -2px -2px 0 #000,
           0   -2px 0 #000,
           2px -2px 0 #000,
           2px  0   0 #000,
           2px  2px 0 #000,
           0    2px 0 #000,
          -2px  2px 0 #000,
          -2px  0   0 #000;
    }
    .outlined-thick {
        //color: white;
        text-shadow:
          -3px -3px 0 #000,
           0   -3px 0 #000,
           3px -3px 0 #000,
           3px  0   0 #000,
           3px  3px 0 #000,
           0    3px 0 #000,
          -3px  3px 0 #000,
          -3px  0   0 #000;
    }
    body .modal-dialog {
      width: auto !important;
      display: inline-block;
    }
    .tags{
        margin-bottom: 0.5rem;
    }
    .following{
        color: MediumSeaGreen;
        font-weight: bold;
    }
    .rainbow-text {
        background: linear-gradient(to right, #FF6663, #FEB144, #FDFD97, #9EE09E, #9EC1CF, #BAC5E8, #CC99C9);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        font-weight: 600;
      }
`);