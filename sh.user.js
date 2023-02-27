// ==UserScript==
// @name         SurfHeaven ranks Ext
// @namespace    http://tampermonkey.net/
// @version      4.2.8
// @description  SH ranks + More stats in profile and map pages
// @author       Original by Link, Extended by kalle
// @updateURL    https://iloveur.mom/i/sh.user.js
// @downloadURL  https://iloveur.mom/i/sh.user.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/chartist/0.11.4/chartist.min.js
// @match        https://surfheaven.eu/*
// @icon         https://www.google.com/s2/favicons?domain=surfheaven.eu
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM.getValue
// @grant        GM.setValue
// @license      MIT
// ==/UserScript==


(async function () {
    'use strict';

    var use_custom = await GM.getValue('sh_ranks_use_custom_id', false);
    var defaut_id = await GM.getValue('sh_ranks_default_id', get_id());
    var custom_id = await GM.getValue('sh_ranks_custom_id', defaut_id);

    var url_path = window.location.pathname.split('/');
    var api_call_count = 0;
    var has_fetched = false; // has fetched completions of uncompleted maps and bonuses
    var map_completions = {};
    var map_types = {};
    var map_tiers = {};
    var bonus_completions = {};

    // SETTINGS
    let settings
    if (unsafeWindow.localStorage.getItem('settings') == null) {
        // defaults
        settings = {
            flags: true,
            follow_list: true,
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
        flags: "Show flags",
        follow_list: "Show follow list",
        cp_chart: "Show CP chart",
        steam_avatar: "Show steam avatar",
        completions_by_tier: "Show completions by tier",
        country_top_100: "Show country top 100",
        hover_info: "Show player/map info on hover",
        map_cover_image: "Show map cover image",
        points_per_rank: "Show points per rank in map",
        
    }

    function validate_settings(){
        if (settings.flags == null) settings.flags = true;
        if (settings.follow_list == null) settings.follow_list = true;
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
        servers_page();
    }
    // PROFILE PAGE
    else if (url_path[url_path.length - 2] == "player") {
        profile_page();
    }
    // MAP PAGE
    else if (url_path[url_path.length - 2] == "map") {
        var current_map_name = url_path[url_path.length - 1];
        map_page(current_map_name);
    }
    // DASHBOARD
    else if (window.location.pathname == "/") {
        dashboard_page();
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
        follow_h5.innerHTML = "FOLLOWED PLAYERS";
        follow_list_root_div.className = "row-recentactivity";
        follow_list_row_div.className = "col-sm-12";
        follow_list_panel_div.className = "panel panel-filled";
        follow_list_panel_body_div.className = "panel-body";

        follow_list_root_div.appendChild(follow_list_row_div);
        follow_list_row_div.appendChild(follow_list_panel_div);
        follow_list_panel_div.appendChild(follow_list_panel_body_div);

        make_request("https://surfheaven.eu/api/online/", (data) => {
            let follow_list = get_follow_list();
            let online_players = [];
            let friends_online = false;
            data.forEach((player) => {
                online_players.push([player.steamid, player.name, player.server, player.map]);
            });
            online_players.forEach((player) => {
                if (follow_list.includes(player[0])) {
                    friends_online = true;
                    let follow_list_item = document.createElement('h5');
                    follow_list_item.innerHTML = `<a href="https://surfheaven.eu/player/${player[0]}">${player[1]}</a> in <a href="steam://connect/surf${player[2]}.surfheaven.eu" title="${player[3]}" style="color:rgb(0,255,0)">#${player[2]}</a>`
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
    }else{
        insert_flags_to_profiles();
    }

    // listening for clicks to add flags when tabulating through multi-page tables (top 100, reports etc.)
    document.addEventListener('click', (e) => {
        if (e.target.tagName == "A") {
            insert_flags_to_profiles();
        }
    });

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
            if(e.target.tagName == "A" && !e.target.href.includes("#")){
                hover_timeout = setTimeout(() => {
                    if(e.target.href.includes("player")){
                        let steamid = e.target.href.split('/')[4];
                        make_request(`https://surfheaven.eu/api/playerinfo/${steamid}`, (data) => {
                            display_hover_info(data, 0, e)
                        });

                    }else if(e.target.href.includes('map')){
                        let map_name = e.target.href.split('/')[4];
                        make_request(`https://surfheaven.eu/api/mapinfo/${map_name}`, (data) => {
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
            fade_in(hover_div);

            function format_date(time){
                return time.split('T')[0];
            }
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
                hover_div.innerHTML = `<div class="row">
                <div class="col-sm-5">
                    <h5>Rank</h5>
                    <h5>Points</h5>
                    <h5>Playtime</h5>
                    <h5>Last seen</h5>
                </div>
                <div class="col-sm-7">
                    <h5>#${data[0].rank} (${create_flag(data[0].country_code)} #${data[0].country_rank})</h5>
                    <h5>${format_points(data[0].points)} (${(data[0].rankname == "Custom" ? "#"+ data[0].rank : data[0].rankname)})</h5>
                    <h5>${format_time(data[0].playtime)}h</h5>
                    <h5>${format_date(data[0].lastplay)}</h5>
                </div>
            </div>
            `;
            }
            if(type == 1){
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
            </div>
            `;
            }
            hover_div.style.top = (e.target.getBoundingClientRect().top + Math.floor(window.scrollY) - (hover_div.getBoundingClientRect().height/2) + (e.target.getBoundingClientRect().height/2)) + "px";
        }
    }

    const navbar = document.querySelector('.nav');
    const li_wrapper = document.createElement('li');
    const settings_link = document.createElement('a');
    settings_link.href = "#";
    li_wrapper.appendChild(settings_link);
    settings_link.innerHTML = `SETTINGS <i class="fa fa-cog fa-lg" aria-hidden="true"></i>`;
    settings_link.addEventListener('click', open_settings_menu);
    navbar.insertBefore(li_wrapper, navbar.children[4]);


    function make_request(url, func) {
        GM_xmlhttpRequest({
            method: "GET",
            url: url,
            onload: (response) => {
                if (response.status != 502) {
                    const data = JSON.parse(response.responseText)
                    if (data.length > 0) {
                        func(data);
                    }
                } else {
                    func(false);
                }
            }
        });
        api_call_count++;
        //console.log("API calls: " + api_call_count + " called: " + url);
    }

    function map_youtube_link(map_name) {
        var has_youtube_link = document.querySelector('.media > h5:nth-child(5)') == null ? false : true;
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
            // i painstakingly got api-restricted 3 times fetching every country to get only countries with players
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
            make_request("https://surfheaven.eu/api/playerinfo/" + id_input.value, async (data) => {
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
            id_input.style = "display: inline-block; margin-left: 10px; border: 1px solid rgb(247, 175, 62); width: 250px;"
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

    function insert_flags_to_profiles() {
        if(!settings.flags) return;
        var a = document.getElementsByTagName('a');
        Array.from(a).forEach(function (link) {
            if (link.href.includes("https://surfheaven.eu/player/")) {
                if (link.href.includes("#")) {
                    return;
                }
                if (!link.querySelector('img')) {
                    var country = ""
                    var id = link.href.split("https://surfheaven.eu/player/")[1];
                    var cached_country = unsafeWindow.localStorage.getItem(id);
                    if (cached_country) {
                        //console.log("Using cached country for " + id)
                        country = cached_country;
                        link.innerHTML = create_flag(country) + " " + link.innerHTML;
                    } else {
                        //console.log("Fetching country for " + id)
                        make_request("https://surfheaven.eu/api/playerinfo/" + id, (data) => {
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
        titlediv.appendChild(rank_elem);
        make_request("https://surfheaven.eu/api/maprecord/" + map_name + "/" + _id, (data) => {
            var time = data[0].time;
            var formatted_time = new Date(time * 1000).toISOString().substr(11, 12);
            rank_elem.innerHTML = "Your rank: " + data[0].rank + " (" + formatted_time + ") <br> Points earned: " + data[0].points;
            add_shadow_to_text_recursively(rank_elem);
        });
    }

    function completions_by_tier(id) {
        if(!settings.completions_by_tier) return;
        var completions = new Array(7).fill(0);
        var total = new Array(7).fill(0);
        var bonus_completions = new Array(7).fill(0);
        var bonus_total = new Array(7).fill(0);
        make_request("https://surfheaven.eu/api/records/" + id, (data) => {
            if (data) {
                for (var i = 0; i < data.length; i++) {
                    var track = data[i].track;
                    var tier = data[i].tier;
                    if (track == 0) {
                        completions[tier - 1]++;
                    } else {
                        bonus_completions[tier - 1]++;
                    }
                }
                make_request("https://surfheaven.eu/api/maps", (data2) => {
                    for (var i = 0; i < data2.length; i++) {
                        var tier = data2[i].tier;
                        total[tier - 1]++;
                        bonus_total[tier - 1] += data2[i].bonus;
                    }
                    var table = document.createElement('table');
                    table.className = "table medium m-t-sm"
                    table.style = "margin-bottom: 0px;"
                    var completions_tbody = document.createElement('tbody');
                    completions_tbody.innerHTML = "<tr><th>Tier</th><th>Maps</th><th>Map %</th><th>Bonuses</th><th>Bonus %</th></tr>";
                    for (var j = 0; j < 7; j++) {
                        var _tier = j + 1;
                        var map_percent = Math.floor(completions[j] / total[j] * 100);
                        var bonus_percent = Math.floor(bonus_completions[j] / bonus_total[j] * 100);
                        completions_tbody.innerHTML += "<tr><td>T" + _tier + "</td><td>" + completions[j] + "/" + total[j] + "</td><td>" + map_percent + "%</td><td>" + bonus_completions[j] + "/" + bonus_total[j] + "</td><td>" + bonus_percent + "%</td></tr>";
                    }
                    table.appendChild(completions_tbody);
                    var target_row = ".panel-c-warning > div:nth-child(1) > div:nth-child(1)"
                    var target_div = document.querySelector(target_row);
                    var user_div = document.querySelector(target_row + " > div:nth-child(1)");
                    var stats_div = document.querySelector(target_row + " > div:nth-child(2)");
                    var completionsbytier_div = document.createElement('div');
                    user_div.className = "col-sm-4";
                    stats_div.className = "col-md-4";
                    completionsbytier_div.className = "col-md-4";
                    completionsbytier_div.appendChild(table);
                    target_div.appendChild(completionsbytier_div);
                });
            }
        });
    }

    function get_id() {
        var id = "";
        if (use_custom) {
            id = custom_id;
        } else {
            gm_getValue('sh_ranks_default_id').then((value) => {
                if (value != null && value != undefined ) return value;
            });
            make_request("https://surfheaven.eu/api/id", (data) => {
                id = data[0].steamid;
                GM.setValue('sh_ranks_default_id', id);
            });
        }
        return id != "" ? id : defaut_id;
    }

    function fetch_country_rank(id) {
        make_request("https://surfheaven.eu/api/playerinfo/" + id, (data) => {
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
        make_request("https://surfheaven.eu/api/playerinfo/" + id, (data) => {
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
        make_request("https://surfheaven.eu/api/completions", (data) => {
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
                make_request("https://surfheaven.eu/api/maps", (data2) => {
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
        make_request("https://surfheaven.eu/api/records/" + id + "/", (records) => {
            make_request("https://surfheaven.eu/api/servers", (servers) => {
                const table = document.querySelector('.table');
                table.rows[0].insertCell(3).outerHTML = "<th>Rank</th>";
                table.rows[0].insertCell(4).outerHTML = "<th>Bonus</th>";
                const rank_cells = Array(servers.length).fill().map((_, i) => table.rows[i + 1].insertCell(3));
                const bonus_cells = Array(servers.length).fill().map((_, i) => table.rows[i + 1].insertCell(4));

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
                    var rec = server_records[server.map];
                    if (rec) {
                        const map_record = rec[0];
                        if (map_record) {
                            const txt = document.createTextNode(map_record.rank + " / " + server.mapinfo.completions);
                            rank_cells[i].appendChild(txt);
                        } else {
                            const txt = document.createTextNode("0 / " + server.mapinfo.completions);
                            rank_cells[i].appendChild(txt);
                        }
                        const bonus_completes = rec.reduce((value, record) => record && record.track > 0 ? value + 1 : value, 0);

                        const txt = document.createTextNode(bonus_completes + " / " + server.mapinfo.bonus);
                        bonus_cells[i].appendChild(txt);
                    } else {
                        const txt = document.createTextNode("0 / " + server.mapinfo.completions);
                        rank_cells[i].appendChild(txt);

                        const txt_2 = document.createTextNode("0 / " + server.mapinfo.bonus);
                        bonus_cells[i].appendChild(txt_2);
                    }
                });

                document.querySelector('.my-checkbox').disabled = false;

                fetch_bonus_ranks(id, servers, server_records);
            });
        });
    }

    function fetch_bonus_ranks(id, servers, server_records) {
        const table = document.querySelector('.table');

        make_request("https://surfheaven.eu/api/completions", (completions) => {
            servers.forEach((server, server_index) => {
                // eslint-disable-next-line no-unused-vars
                const server_completions = completions.filter(completion => completion.map === server.map && completion.track > 0);
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
                div.style.display = row.cells[0].children[0].style.display;
                const div_2 = document.createElement('div');
                div_2.className = "hidden-row";
                div_2.style.display = row.cells[0].children[0].style.display;

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
            });

        });
    }

    function auto_fetch_ranks() {
        make_request("https://surfheaven.eu/api/id", (data) => {
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
        make_request("https://surfheaven.eu/api/playerinfo/" + get_id() + "/", (c) => {
            var country = ""
            if (unsafeWindow.localStorage.getItem("country") == null) {
                country = c[0].country_code;
                unsafeWindow.localStorage.setItem("country", country);
            } else {
                country = unsafeWindow.localStorage.getItem("country");
            }
            make_request("https://surfheaven.eu/api/ctop/" + country + "/100", (data) => {
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
                ctop_panel_body_div.className = "panel-body";
                ctop_panel_body_div.style = "display: block;";
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
                    });
                    insert_flags_to_profiles();
                    add_country_dropdown();
                })
            });
        });
    }

    function servers_page() {
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
    }

    function profile_page() {
        var steam_profile_url = document.querySelector('.m-t-xs > a:nth-child(2)') == null ? document.querySelector('.m-t-xs > a:nth-child(1)').href : document.querySelector('.m-t-xs > a:nth-child(2)').href;
        var current_profile_id = url_path[url_path.length - 1];

        if(settings.follow_list){
            var follow_button = document.createElement('button');
            if (get_follow_list().includes(current_profile_id)) {
                follow_button.className = 'btn btn-danger btn-xs';
                follow_button.innerHTML = "Unfollow";
            } else {
                follow_button.className = 'btn btn-success btn-xs';
                follow_button.innerHTML = "Follow";
            }
            follow_button.onclick = function () {
                follow_user(current_profile_id);
                if (follow_button.innerHTML == "Follow") {
                    follow_button.className = 'btn btn-danger btn-xs';
                    follow_button.innerHTML = "Unfollow";
                } else {
                    follow_button.className = 'btn btn-success btn-xs';
                    follow_button.innerHTML = "Follow";
                }
            };
    
            const username_h2 = document.querySelector('.m-t-xs')
            username_h2.appendChild(follow_button);
        }

        insert_steam_avatar(steam_profile_url);
        fetch_country_rank(current_profile_id);
        fetch_completions_of_uncompleted_maps();
        fetch_time_spent(current_profile_id);
        completions_by_tier(current_profile_id);
        
        // total points from map completions
        let map_points = 0;
        make_request("https://surfheaven.eu/api/records/"+current_profile_id+"/track", function (data) {
            for(let i = 0; i < data.length; i++){
                map_points += data[i].points;
            }
            console.log("total points from map completions: " + map_points);
            var stats_table = document.querySelector('.medium > tbody:nth-child(1)');
            var stats_table_rows = stats_table.children;
            var points_td = document.createElement('td');
            points_td.innerHTML = '<strong class="c-white">'+map_points+'</strong> Points from map completions';
            stats_table_rows[4].appendChild(points_td);

        });

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

    function map_page(current_map_name) {
        // padding fix to not cut off the shadows
        let padding_fix = document.querySelector('.media');
        padding_fix.style = "padding-left: 10px;";

        fetch_map_rank(current_map_name);
        cp_chart();
        map_youtube_link(current_map_name);
        insert_map_picture(current_map_name);
        insert_points_per_rank(current_map_name);
        
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

        console.log(`${count} ranks needed before we hit last rank, ${last_rank}`);
        ranks = ranks.slice(0, count);
        ranks.push(last_rank);
        console.log("new ranks array: ",ranks)

        for(let i = 0; i < ranks.length; i++){
            make_request("https://surfheaven.eu/api/maprank/"+map_name+"/"+ranks[i]+"/0", function(data){
                console.log("getting points for rank: ",ranks[i])
                points.push(data[0].points);
                console.log(data[0].name,data[0].rank,data[0].points);
            });
        }
        // make_request isnt async so we need to wait for /some time/ before we can start using the data
        setTimeout(function(){
            points.sort(function(a, b){return b-a});
            console.log(points,ranks)

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

        make_request('https://surfheaven.eu/api/checkpoints/' + current_map_name, function (data) {
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
                make_request('https://surfheaven.eu/api/checkpoints/' + current_map_name + '/' + get_id(), function (data2) {
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
            //console.log(correct_div)
            //console.log(table_div)
            //console.log(table)
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
                        make_request('https://surfheaven.eu/api/checkpoints/' + current_map_name + '/' + id, function (data3) {
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
        settings_div.classList.add("card","settings-div", "text-white", "bg-dark");
        settings_div.style.padding = "1rem";
        settings_div.style.borderRadius = "0.5rem";
        settings_div.style.border = "1px solid rgba(0,0,0,0.125)";

        //close button
        const close_button = document.createElement("button");
        close_button.type = "button";
        close_button.classList.add("btn", "btn-sm", "btn-outline-secondary");
        close_button.style.position = "absolute";
        close_button.style.top = "5px";
        close_button.style.right = "5px";

        close_button.innerHTML = `<i class="fas fa-times fa-lg"></i>`;
        close_button.addEventListener("click", () => {
            settings_container.remove();
        });
        settings_div.appendChild(close_button);

        //title
        const settings_title = document.createElement("h4");
        settings_title.classList.add("card-title", "mb-3", "text-white");
        settings_title.style.marginTop = "0px";
        settings_title.textContent = "Settings";
        settings_div.appendChild(settings_title);

        //checkboxes for settings
        for (let key in settings) {
            const label = document.createElement('label');
            const input = document.createElement('input');
            
            input.type = 'checkbox';
            input.id = key;
            input.name = 'settings';
            input.checked = settings[key];
            
            label.appendChild(input);
            label.appendChild(document.createTextNode(" "+settings_labels[key]));
            label.style.paddingLeft = "1rem";
            
            settings_div.appendChild(label);
            settings_div.appendChild(document.createElement('br'));
        }

        //save settings
        const save_settings_button = document.createElement("button");
        save_settings_button.classList.add("btn", "btn-sm", "btn-success");
        save_settings_button.textContent = "Save settings";
        save_settings_button.style.marginTop = "1rem";
        save_settings_button.style.marginBottom = "1rem";
        settings_div.appendChild(save_settings_button);

        save_settings_button.onclick = () => {
            const checkboxes = document.querySelectorAll('input[name=settings]');
            console.log(checkboxes);
            checkboxes.forEach((checkbox) => {
                settings[checkbox.id] = checkbox.checked;
            });
            unsafeWindow.localStorage.setItem("settings", JSON.stringify(settings));
            location.reload();
        }

        // purge flags
        const purge_flags_button = document.createElement("button");
        purge_flags_button.classList.add("btn", "btn-sm", "btn-primary");
        purge_flags_button.textContent = "Purge flags cache";
        purge_flags_button.onclick = purge_flags_cache
        settings_div.appendChild(document.createElement('br'));
        settings_div.appendChild(purge_flags_button);
        
        //changelog title
        const changelog_title = document.createElement("h5");
        changelog_title.classList.add("card-title", "mb-3", "text-white");
        changelog_title.textContent = "Changelog";
        settings_div.appendChild(changelog_title);

        //changelog textbox
        const changelog_textbox = document.createElement("textarea");
        changelog_textbox.classList.add("form-control");
        changelog_textbox.style.height = "150px";
        changelog_textbox.style.width = "300px";
        changelog_textbox.style.resize = "none";
        changelog_textbox.textContent = changelog;
        changelog_textbox.setAttribute("readonly", "");
        settings_div.appendChild(changelog_textbox);

        //footer
        const settings_footer = document.createElement("div");
        const footer_link = document.createElement("span");
        footer_link.style.color = "white";
        footer_link.innerHTML = `<i class="fab fa-github fa-lg"></i><a href="https://github.com/Kalekki/SurfHeaven_Extended" target="_blank" style="color:white;"> Drop me a star, will ya?</a>`;
        settings_footer.appendChild(footer_link);
        settings_footer.classList.add("card-footer");
        settings_footer.style.marginTop = "1rem";
        settings_div.appendChild(settings_footer);

        //container
        const settings_container = document.createElement("div");
        settings_container.id = "settings-container";
        settings_container.classList.add("card");
        settings_container.classList.add("text-white", "bg-dark");
        settings_container.style.position = "fixed";
        settings_container.style.top = "50%";
        settings_container.style.left = "50%";
        settings_container.style.transform = "translate(-50%, -50%)";
        settings_container.style.zIndex = "9999";
        settings_container.style.border = "1px solid rgba(0,0,0,1)";
        settings_container.style.borderRadius = "0.5rem";
        settings_container.appendChild(settings_div);
        document.body.appendChild(settings_container);
    }

    const changelog = 
`___4.2.8___
Added ability to add more players to charts
Added points per rank to maps
Added points from map completions to profile

___4.2.7.2___
Improved the map page, thanks for the feedback

___4.2.7.1___
Fixed cp chart text shadows

___4.2.7___
Added hover info to players and maps
Added map cover images to map pages

___4.2.6___
Added settings menu
Added ability to toggle individual features
Added ability to purge flags cache
Fixed doubled flags (hopefully)

I made a github repo for this,
if u have issues or want to clean up this mess, please post them there.
https://github.com/Kalekki/SurfHeaven_Extended
`

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
        stroke: white;
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

      
`);