// ==UserScript==
// @name         SurfHeaven ranks Ext
// @namespace    http://tampermonkey.net/
// @version      4.2.5.1
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
 

(async function() {
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

    // SERVERS PAGE
    if (window.location.pathname.endsWith("/servers/")) {
        servers_page();
    }
    // PROFILE PAGE
    else if(url_path[url_path.length - 2] == "player") {
        profile_page();
    }
    // MAP PAGE
    else if(url_path[url_path.length - 2] == "map") {
        var current_map_name = url_path[url_path.length - 1];
        map_page(current_map_name);
    }
    // DASHBOARD
    else if( window.location.pathname == "/") {
        dashboard_page();
    }

    insert_flags_to_profiles();
    // update flags on table page changes etc
    document.addEventListener('click', function(e) {
        if(e.target && e.target.nodeName == "A") {
            insert_flags_to_profiles();
        }
    });
 
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
                }
                else {
                    func(false);
                }
            }
        });
        api_call_count++;
        //console.log("API calls: " + api_call_count + " called: " + url);
    }

    function map_youtube_link(map_name){
        var has_youtube_link = document.querySelector('.media > h5:nth-child(5)') == null ? false : true;
        if(!has_youtube_link){
            var media_div = document.querySelector('.media');
            var youtube_link = document.createElement('h5');
            youtube_link.innerHTML = `<i style="color: red;" class="fab fa-youtube fa-lg"></i><a href="https://www.youtube.com/results?search_query=${map_name}" target="_blank">Search the map on Youtube</a>`;
            media_div.appendChild(youtube_link);
        }
    }

    function add_country_dropdown(){
        $(document).ready(function(){
            // i painstakingly got api-restricted 3 times fetching every country to get only countries with players
            var countries = [
            "ALA","ALB","DZA","AND","AGO","AIA","ATG","ARG","ARM","ABW","AUS","AUT","AZE","BHR","BGD","BLR","BEL",
            "BLZ","BMU","BOL","BIH","BRA","BRN","BGR","KHM","CAN","CPV","CYM","CHL","CHN","HKG","MAC","COL","CRI",
            "CIV","HRV","CUW","CYP","CZE","DNK","DOM","ECU","EGY","SLV","EST","FRO","FIN","FRA","GEO","DEU","GHA",
            "GIB","GRC","GRL","GLP","GUM","GTM","GGY","HND","HUN","ISL","IND","IDN","IRN","IRQ","IRL","IMN","ISR",
            "ITA","JPN","JEY","JOR","KAZ","KEN","PRK","KOR","KWT","KGZ","LVA","LBN","LBY","LIE","LTU","LUX","MKD",
            "MDG","MYS","MDV","MLI","MLT","MTQ","MRT","MUS","MEX","MDA","MCO","MNG","MNE","MAR","MMR","NAM","NPL",
            "NLD","ANT","NZL","NGA","MNP","NOR","OMN","PAK","PSE","PAN","PRY","PER","PHL","POL","PRT","PRI","QAT",
            "REU","ROU","RUS","SPM","SMR","SAU","SEN","SRB","SYC","SGP","SVK","SVN","ZAF","ESP","LKA","SDN","SWE",
            "CHE","SYR","TWN","TJK","TZA","THA","TTO","TUN","TUR","UKR","ARE","GBR","USA","URY","UZB","VEN","VNM",
            "ZMB","XKX"
            ];
            var ctop_panel_heading_div = document.getElementsByClassName('panel-heading')[1];
            var ctop_title_text = ctop_panel_heading_div.querySelector('span');
            var ctop_dropdown = document.createElement('select');
            ctop_dropdown.className = "form-control";
            ctop_dropdown.style = "width: 100px; display: inline; margin-right: 10px;";
            ctop_dropdown.id = "ctop_dropdown";
            for(var i = 0; i < countries.length; i++){
                var ctop_option = document.createElement('option');
                var full_name = new Intl.DisplayNames(['en'], {type: 'region'});
                var country_name = full_name.of(countryISOMapping(countries[i]));
                ctop_option.innerHTML = country_name;
                ctop_option.value = countries[i];
                ctop_dropdown.appendChild(ctop_option);
            }
            ctop_panel_heading_div.insertBefore(ctop_dropdown, ctop_title_text);
            ctop_dropdown.selectedIndex = countries.indexOf(unsafeWindow.localStorage.getItem("country"));
            ctop_dropdown.addEventListener('change', function(){
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
        }
        else {
            await GM.setValue('sh_ranks_use_custom_id', false);
 
            my_div.removeChild(my_div.lastElementChild)
            my_div.removeChild(my_div.lastElementChild)
            reset_ranks();
            auto_fetch_ranks();
        }
    }

    function insert_flags_to_profiles(){
        $(document).ready(function(){
            var a = document.getElementsByTagName('a');
            Array.from(a).forEach(function(link) {
                if(link.href.includes("https://surfheaven.eu/player/")){
                    if(link.href.includes("#")){
                        return;
                    }
                    if (!link.querySelector('img')) {
                        var country = ""
                        var id = link.href.split("https://surfheaven.eu/player/")[1];
                        var cached_country = unsafeWindow.localStorage.getItem(id);
                        if (cached_country) {
                            console.log("Using cached country for " + id)
                            country = cached_country;
                            var flag = document.createElement('img');
                            country == ("" || undefined) ? flag.src = "https://upload.wikimedia.org/wikipedia/commons/2/2a/Flag_of_None.svg" : flag.src = country_code_to_flag_url(country);
                            flag.style = "margin-right: 2px; margin-bottom: 2px; width: 23px; height:14px;";
                            link.innerHTML = flag.outerHTML + " " + link.innerHTML;
                        } else {
                            console.log("Fetching country for " + id)
                            make_request("https://surfheaven.eu/api/playerinfo/" + id, (data) => {
                                        if (data) {
                                            country = data[0].country_code;
                                            unsafeWindow.localStorage.setItem(id, country);
                                            var flag = document.createElement('img');
                                            country == ("" || undefined) ? flag.src = "https://upload.wikimedia.org/wikipedia/commons/2/2a/Flag_of_None.svg" : flag.src = country_code_to_flag_url(country);
                                            flag.style = "margin-right: 2px; margin-bottom: 2px; width: 23px; height:14px;";
                                            link.innerHTML = flag.outerHTML + " " + link.innerHTML;
                                }
                            })
                        }
                    }
                }
            });
         });
    }

    function fetch_map_rank(map_name){
        var _id = get_id();
        var titlediv = document.querySelector('.media');
        var rank_elem = document.createElement('h4');
        rank_elem.innerHTML = "You have not completed this map :(";
        titlediv.appendChild(rank_elem);
        make_request("https://surfheaven.eu/api/maprecord/"+map_name+"/"+_id, (data) => {
                var time = data[0].time;
                var formatted_time = new Date(time * 1000).toISOString().substr(11, 12);
                rank_elem.innerHTML = "Your rank: " + data[0].rank + " (" + formatted_time + ") <br> Points earned: " + data[0].points;
            }
        );
    }

    function completions_by_tier(id){
        var completions = new Array(7).fill(0);
        var total = new Array(7).fill(0);
        var bonus_completions = new Array(7).fill(0);
        var bonus_total = new Array(7).fill(0);
        make_request("https://surfheaven.eu/api/records/"+id, (data) => {
            if (data) {
                for(var i = 0; i < data.length; i++){
                    var track = data[i].track;
                    var tier = data[i].tier;
                    if(track == 0){
                        completions[tier-1]++;
                    }else{
                        bonus_completions[tier-1]++;
                    }
                }
                make_request("https://surfheaven.eu/api/maps", (data2) => {
                    for(var i = 0; i < data2.length; i++){
                        var tier = data2[i].tier;
                        total[tier-1]++;
                        bonus_total[tier-1] += data2[i].bonus;
                    }
                    //var completions_by_tier_label = document.createElement('h4')
                    //completions_by_tier_label.innerHTML = "Completions by Tier";
                    var table = document.createElement('table');
                    table.className = "table medium m-t-sm"
                    table.style = "margin-bottom: 0px;"
                    var completions_tbody = document.createElement('tbody');
                    completions_tbody.innerHTML = "<tr><th>Tier</th><th>Maps</th><th>Map %</th><th>Bonuses</th><th>Bonus %</th></tr>";
                    for(var j = 0; j < 7; j++){
                        var _tier = j+1;
                        var map_percent = Math.floor(completions[j]/total[j]*100);
                        var bonus_percent = Math.floor(bonus_completions[j]/bonus_total[j]*100);
                        completions_tbody.innerHTML += "<tr><td>Tier "+_tier+"</td><td>"+completions[j]+"/"+total[j]+"</td><td>"+map_percent+"%</td><td>"+bonus_completions[j]+"/"+bonus_total[j]+"</td><td>"+bonus_percent+"%</td></tr>";
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
                    //completionsbytier_div.appendChild(completions_by_tier_label);
                    completionsbytier_div.appendChild(table);
                    target_div.appendChild(completionsbytier_div);
                });
            }
        });
    }

    function get_id(){
        var id = "";
        if (use_custom) {
            id = custom_id;
        }else{
            make_request("https://surfheaven.eu/api/id", (data) => {
                id = data[0].steamid;
                GM.setValue('sh_ranks_default_id', id);
        });}
        return id != "" ? id : defaut_id;
    }

    function fetch_country_rank(id){
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

    function fetch_time_spent(id){
        make_request("https://surfheaven.eu/api/playerinfo/" + id, (data) => {
            if (data) {
                var time_spent_spec = data[0].totalspec;
                var time_spent_loc = data[0].totalloc;
                time_spent_loc = (time_spent_loc / 3600).toFixed(2);
                time_spent_spec = (time_spent_spec / 3600).toFixed(2);
                var ts_tr = document.createElement('tr');
                var ts_td = document.createElement('td');
                ts_td.innerHTML = "Time in spec: " + time_spent_spec + "h, Time in loc: " + time_spent_loc + "h";
                ts_tr.appendChild(ts_td);
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
                    }else{
                        // Bonus stage
                        var bonus_map = map.map + " " + map.track;
                        if(map.completions!= undefined){ // LOOKING AT YOU surf_fornax b7
                            bonus_completions[bonus_map] = map.completions;
                        }else{
                            bonus_completions[bonus_map] = 0;
                        }
                    }
                    if(map.type != undefined){
                        map_types[map.map] = map.type == 0 ? "Linear" : "Staged";
                    }
                });
                make_request("https://surfheaven.eu/api/maps", (data2) => {
                    if(data2){
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
                return; // dont update if already updated
            }
            var completions_txt = document.createElement('td');
            completions_txt.innerHTML = " " + map_completions[map_name] + " completions";
            completions_txt.style.color = "#949BA2";
            completions_txt.style.float = "right";
            completions_txt.style.marginRight = "15%";
            if(has_fetched) a_element.appendChild(completions_txt);
        });
    }

    function sort_map_completions(order){
        var map_completions_table = document.querySelector('#DataTables_Table_1');
        var map_rows = map_completions_table.rows;
        var map_names = [];
        for (var i = 1; i < map_rows.length; i++) {
            var map_name = map_rows[i].cells[0].innerHTML;
            map_name = map_name.split(">")[1].split("<")[0];
            map_names.push(map_name);
        }
        if(order == "asc"){
            map_names.sort((a, b) => {
                return map_completions[a] - map_completions[b];
            });
        }else{
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

    function sort_bonus_completions(order){
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
        if(order == "asc"){
            bonus_maps.sort((a, b) => {
                return bonus_completions[a] - bonus_completions[b];
            });
        }else{
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
            bonus_map_name_td.innerHTML = "<a href=\"https://surfheaven.eu/map/" + bonus_map.split(" ")[0] + "\">" + bonus_map.split(" ")[0] + "</a> <span style=\"color: #949BA2; float: right; margin-right: 15%;\">" + (bonus_completions[bonus_map] != undefined ? bonus_completions[bonus_map] : 0 )+ " completions</span>"
            bonus_map_number_td.innerHTML = "Bonus " + bonus_map.split(" ")[1];
            bonus_map_row.appendChild(bonus_map_name_td);
            bonus_map_row.appendChild(bonus_map_number_td);
            bonus_completions_tbody.appendChild(bonus_map_row);
        });
    }

    function update_bonus_completions(){
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
            if(has_fetched){
                if (bonus_rows[i].cells[0].innerHTML.includes("completions")) return;
                bonus_rows[i].cells[0].appendChild(completions_txt);
            }
        }
    }

    function country_code_to_flag_url(country_code) {
        var url = ("https://surfheaven.eu/flags/"+countryISOMapping(country_code)+".svg").toLowerCase();
        if(url == "https://surfheaven.eu/flags/undefined.svg") url = "https://upload.wikimedia.org/wikipedia/commons/2/2a/Flag_of_None.svg"
        return url;
    }

    function countryISOMapping(country_code, reverse = false){
        // https://github.com/vtex/country-iso-3-to-2/blob/master/index.js
        var countryISOMap = {
            AFG: "AF",ALA: "AX",ALB: "AL",DZA: "DZ",ASM: "AS",AND: "AD",AGO: "AO",AIA: "AI",ATA: "AQ",ATG: "AG",ARG: "AR",ARM: "AM",ABW: "AW",AUS: "AU",AUT: "AT",
            AZE: "AZ",BHS: "BS",BHR: "BH",BGD: "BD",BRB: "BB",BLR: "BY",BEL: "BE",BLZ: "BZ",BEN: "BJ",BMU: "BM",BTN: "BT",BOL: "BO",BES: "BQ",BIH: "BA",BWA: "BW",
            BVT: "BV",BRA: "BR",VGB: "VG",IOT: "IO",BRN: "BN",BGR: "BG",BFA: "BF",BDI: "BI",KHM: "KH",CMR: "CM",CAN: "CA",CPV: "CV",CYM: "KY",CAF: "CF",TCD: "TD",
            CHL: "CL",CHN: "CN",HKG: "HK",MAC: "MO",CXR: "CX",CCK: "CC",COL: "CO",COM: "KM",COG: "CG",COD: "CD",COK: "CK",CRI: "CR",CIV: "CI",HRV: "HR",CUB: "CU",
            CUW: "CW",CYP: "CY",CZE: "CZ",DNK: "DK",DJI: "DJ",DMA: "DM",DOM: "DO",ECU: "EC",EGY: "EG",SLV: "SV",GNQ: "GQ",ERI: "ER",EST: "EE",ETH: "ET",FLK: "FK",
            FRO: "FO",FJI: "FJ",FIN: "FI",FRA: "FR",GUF: "GF",PYF: "PF",ATF: "TF",GAB: "GA",GMB: "GM",GEO: "GE",DEU: "DE",GHA: "GH",GIB: "GI",GRC: "GR",GRL: "GL",
            GRD: "GD",GLP: "GP",GUM: "GU",GTM: "GT",GGY: "GG",GIN: "GN",GNB: "GW",GUY: "GY",HTI: "HT",HMD: "HM",VAT: "VA",HND: "HN",HUN: "HU",ISL: "IS",IND: "IN",
            IDN: "ID",IRN: "IR",IRQ: "IQ",IRL: "IE",IMN: "IM",ISR: "IL",ITA: "IT",JAM: "JM",JPN: "JP",JEY: "JE",JOR: "JO",KAZ: "KZ",KEN: "KE",KIR: "KI",PRK: "KP",
            KOR: "KR",KWT: "KW",KGZ: "KG",LAO: "LA",LVA: "LV",LBN: "LB",LSO: "LS",LBR: "LR",LBY: "LY",LIE: "LI",LTU: "LT",LUX: "LU",MKD: "MK",MDG: "MG",MWI: "MW",
            MYS: "MY",MDV: "MV",MLI: "ML",MLT: "MT",MHL: "MH",MTQ: "MQ",MRT: "MR",MUS: "MU",MYT: "YT",MEX: "MX",FSM: "FM",MDA: "MD",MCO: "MC",MNG: "MN",MNE: "ME",
            MSR: "MS",MAR: "MA",MOZ: "MZ",MMR: "MM",NAM: "NA",NRU: "NR",NPL: "NP",NLD: "NL",ANT: "AN",NCL: "NC",NZL: "NZ",NIC: "NI",NER: "NE",NGA: "NG",NIU: "NU",
            NFK: "NF",MNP: "MP",NOR: "NO",OMN: "OM",PAK: "PK",PLW: "PW",PSE: "PS",PAN: "PA",PNG: "PG",PRY: "PY",PER: "PE",PHL: "PH",PCN: "PN",POL: "PL",PRT: "PT",
            PRI: "PR",QAT: "QA",REU: "RE",ROU: "RO",RUS: "RU",RWA: "RW",BLM: "BL",SHN: "SH",KNA: "KN",LCA: "LC",MAF: "MF",SPM: "PM",VCT: "VC",WSM: "WS",SMR: "SM",
            STP: "ST",SAU: "SA",SEN: "SN",SRB: "RS",SYC: "SC",SLE: "SL",SGP: "SG",SXM: "SX",SVK: "SK",SVN: "SI",SLB: "SB",SOM: "SO",ZAF: "ZA",SGS: "GS",SSD: "SS",
            ESP: "ES",LKA: "LK",SDN: "SD",SUR: "SR",SJM: "SJ",SWZ: "SZ",SWE: "SE",CHE: "CH",SYR: "SY",TWN: "TW",TJK: "TJ",TZA: "TZ",THA: "TH",TLS: "TL",TGO: "TG",
            TKL: "TK",TON: "TO",TTO: "TT",TUN: "TN",TUR: "TR",TKM: "TM",TCA: "TC",TUV: "TV",UGA: "UG",UKR: "UA",ARE: "AE",GBR: "GB",USA: "US",UMI: "UM",URY: "UY",
            UZB: "UZ",VUT: "VU",VEN: "VE",VNM: "VN",VIR: "VI",WLF: "WF",ESH: "EH",YEM: "YE",ZMB: "ZM",ZWE: "ZW",XKX: "XK", XK: "XK"
          }
        if(reverse){
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
                        }
                        else {
                            const txt = document.createTextNode("0 / " + server.mapinfo.completions);
                            rank_cells[i].appendChild(txt);
                        }
                        const bonus_completes = rec.reduce((value, record) => record && record.track > 0 ? value + 1 : value, 0);
 
                        const txt = document.createTextNode(bonus_completes + " / " + server.mapinfo.bonus);
                        bonus_cells[i].appendChild(txt);
                    }
                    else {
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
                    }
                    else {
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

    function dashboard_page(){
        // CTOP Panel 
        // this shit is such a mess
        make_request("https://surfheaven.eu/api/playerinfo/"+get_id()+"/", (c) => {
            // if localstorage has country code, use that
            var country = ""
            if(unsafeWindow.localStorage.getItem("country") == null){
                country = c[0].country_code;
                unsafeWindow.localStorage.setItem("country", country);
            }else{
                country = unsafeWindow.localStorage.getItem("country");
            }
            make_request("https://surfheaven.eu/api/ctop/"+country+"/100", (data) => {
                var ctop_100 = []
                for(var i = 0; i < data.length; i++){
                    ctop_100[i] = [data[i].name, data[i].points, data[i].rank, data[i].steamid];
                }
                var target_div = document.querySelector('.content > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1)');
                var top_players_div = target_div.querySelector('.content > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1)');
                var top_wr_holders_div = target_div.querySelector('.content > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2)');
                var thirds_class = "col-lg-4 col-md-4 col-sm-12 col-xs-12"
                top_players_div.className = thirds_class;
                top_wr_holders_div.className = thirds_class;
                var ctop_root_div = document.createElement('div');
                ctop_root_div.className = thirds_class;
                var ctop_panel_div = document.createElement('div');
                ctop_panel_div.className = "panel panel-filled";
                var ctop_panel_heading_div = document.createElement('div');
                ctop_panel_heading_div.className = "panel-heading";
                var ctop_panel_body_div = document.createElement('div');
                ctop_panel_body_div.className = "panel-body";
                ctop_panel_body_div.style = "display: block;";
                var ctop_table = document.createElement('table');
                ctop_table.className = "table table-striped table-hover";
                ctop_table.id = "ctop_table";
                var ctop_thead = document.createElement('thead');
                // <TABLE>
                var ctop_tbody = document.createElement('tbody');
                // HEAD ROW
                var ctop_head_row = document.createElement('tr');
                // HEADERS
                //  "CRank"
                var ctop_th_crank = document.createElement('th');
                ctop_th_crank.innerHTML = country+" #";
                // Global Rank
                var ctop_th_grank = document.createElement('th');
                ctop_th_grank.innerHTML = "#";
                // "Name"
                var ctop_th_name = document.createElement('th');
                ctop_th_name.innerHTML = "Name";
                // "Points"
                var ctop_th_points = document.createElement('th');
                ctop_th_points.innerHTML = "Points";
                ctop_head_row.appendChild(ctop_th_crank);
                ctop_head_row.appendChild(ctop_th_grank);
                ctop_head_row.appendChild(ctop_th_name);
                ctop_head_row.appendChild(ctop_th_points);
                ctop_thead.appendChild(ctop_head_row);
                for(var j = 0; j < ctop_100.length; j++){
                    // TABLE ROW
                    // TABLE DATA CELL
                    // name, points,  global rank, steamid
                    // FIN #, Global Rank, Name, Points
                    var row_container = document.createElement('tr');
                    var crank_td = document.createElement('td');
                    crank_td.innerHTML = j+1;
                    var grank_td = document.createElement('td');
                    grank_td.innerHTML = ctop_100[j][2];
                    var name_td = document.createElement('td');
                    var name_a = document.createElement('a');
                    name_a.innerHTML = ctop_100[j][0];
                    name_a.href = "https://surfheaven.eu/player/"+ctop_100[j][3];
                    name_td.appendChild(name_a);
                    var points_td = document.createElement('td');
                    points_td.innerHTML = ctop_100[j][1];
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
                // Sandwich the new div between the two existing ones :3
                top_wr_holders_div.parentNode.insertBefore(ctop_root_div, top_wr_holders_div);
                $(document).ready(function(){
                    $('#ctop_table').DataTable({
                        "ordering": true,
                        "pagingType": "simple",
                        "info":     false,
                        "searching": true,
                        "lengthChange": false,
                    });
                    insert_flags_to_profiles();
                    add_country_dropdown();
                })
            });
        });
    }

    function servers_page(){
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
        }
        else {
            auto_fetch_ranks();
        }
    }

    function profile_page(){
        // Avatar
        var steam_profile_url = document.querySelector('.m-t-xs > a:nth-child(2)') == null? document.querySelector('.m-t-xs > a:nth-child(1)').href : document.querySelector('.m-t-xs > a:nth-child(2)').href;
        var current_profile_id = url_path[url_path.length - 1];

        insert_steam_avatar(steam_profile_url);
        fetch_country_rank(current_profile_id);
        fetch_completions_of_uncompleted_maps();
        fetch_time_spent(current_profile_id);
        completions_by_tier(current_profile_id);
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
        
        sort_completions_button.onclick = function(){
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
        sort_completions_button_b.onclick = function(){
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

    function map_page(current_map_name){
        fetch_map_rank(current_map_name);
        cp_chart();
        map_youtube_link(current_map_name);
    }

    function cp_chart(){
        var top_panel_row = document.querySelector('.panel-c-warning > div:nth-child(1) > div:nth-child(1)')
        var map_info_col = document.querySelector('.panel-c-warning > div:nth-child(1) > div:nth-child(1) > div:nth-child(1)')
        var map_stats_col = document.querySelector('.panel-c-warning > div:nth-child(1) > div:nth-child(1) > div:nth-child(2)')
        var cp_chart_col = document.createElement('div');
        cp_chart_col.className = "col-md-6 ct-chart";
        map_info_col.className = "col-md-3";
        map_stats_col.className = "col-md-3";
        top_panel_row.appendChild(cp_chart_col);

        make_request('https://surfheaven.eu/api/checkpoints/'+current_map_name, function(data){
            var cp_labels = ["Start"];
            var cp_series = [0];
            var own_series = [];
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

            for(var i = 0; i < data.length; i++){
                if(data[i].time != 0){
                    cp_labels.push((i == data.length-1? "End" : "CP"+(i+1)));
                    cp_series.push(data[i].time);
                }
            }
            cp_chart.update({series: [cp_series],labels: cp_labels});
            // if we are WR (🥳), we can skip checking our own time again
            if(data[0].steamid != get_id()){
                make_request('https://surfheaven.eu/api/checkpoints/'+current_map_name+'/'+get_id(), function(data2){
                    if(data2.length != 0){
                        own_series = [0];
                        for (var i = 0; i < data2.length; i++) {
                            if (data2[i].time != 0) {
                                own_series.push(data2[i].time);
                            };
                            var diff = (own_series[i] - cp_series[i]).toFixed(2);
                            // sometimes the api returns checkpoints with missing times, fun
                            if (i != 0 && i < data2.length-1 && !isNaN(diff)) cp_labels[i] += "\n (" + (diff > 0 ? "+" : "") + diff + ")";
                        }
                        // manually adding diff to the end, because mysteriously sometimes it's not added,
                        // and after i manually add it, sometimes its added twice, but still only visible once??? maybe im retarded, maybe its maybeline
                        var end_diff = (own_series[own_series.length - 1] - cp_series[cp_series.length - 1]).toFixed(2);
                        end_diff = (end_diff > 0 ? "+" : "") + end_diff;
                        cp_labels[cp_labels.length - 1] += "\n (" + end_diff + ")";
                        console.log(cp_series, own_series, cp_labels)
                        cp_chart.update({
                            series: [cp_series, own_series],
                            labels: cp_labels
                        });
                    }
                });
            }
        });
    }

    function insert_steam_avatar(steam_profile_url){
        GM_xmlhttpRequest({
            method: 'GET',
            url: '/inc/getSteam.php?u=' + steam_profile_url,
            responseType: 'json',
            onload: function(response) {
                if(response.status == 200){
                    var image_full = response.response.Image.replace(".jpg", "_full.jpg");
                    var image_with_style = image_full.replace("/>", "style='border-radius: 5px;margin-right:10px;float:left;' />");
                    var media_div = document.querySelector('.media');
                    media_div.insertAdjacentHTML('afterbegin', image_with_style);
                    var profile_icon = document.querySelector('.pe-7s-user');
                    profile_icon.remove();
                }else{
                    console.log("Error getting steam avatar: " + response.status);
                }
            }
        })
    }

})();
 
GM_addStyle( `
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
`);