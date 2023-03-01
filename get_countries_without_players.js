//useful so we dont populate ctop with empty countries
//ms to wait between requests
let cooldown = 400;

async function fetchData(countryCodes) {
  const emptyResponseCountries = [];
  for (const countryCode of countryCodes) {
    console.log("fetching ",countryCode)
    await new Promise(resolve => setTimeout(resolve, cooldown));
    const response = await fetch(`https://surfheaven.eu/api/ctop/${countryCode}`);
    if (!response.ok) {
      throw new Error(`Request for country code ${countryCode} failed with status ${response.status}`);
    }
    const data = await response.json();
    if (!Object.keys(data).length) {
      emptyResponseCountries.push(countryCode);
    }
  }
  return emptyResponseCountries;
}
// countries that have players have been filtered from this list
countries = [
    "AFG","ASM","ATA","BHS","BRB","BEN","BTN","BES","BWA","BVT","VGB","IOT","BFA","BDI","CMR","CAF","TCD","CXR","CCK","COM","COG","COD","COK",
    "CUB","DJI","DMA","GNQ","ERI","ETH","FLK","FJI","GUF","PYF","ATF","GAB","GMB","GRD","GIN","GNB","GUY","HTI","HMD","VAT","JAM","KIR","LAO",
    "LSO","LBR","MWI","MHL","MYT","FSM","MSR","MOZ","NRU","NCL","NIC","NER","NIU","NFK","PLW","PNG","PCN","RWA","BLM","SHN","KNA","LCA","MAF",
    "VCT","WSM","STP","SLE","SXM","SLB","SOM","SGS","SSD","SUR","SJM","SWZ","TLS","TGO","TKL","TON","TKM","TCA","TUV","UGA","UMI","VUT","VIR",
    "WLF","ESH","YEM","ZWE"
    ]

fetchData(countries)
  .then(emptyResponseCountries => {
    console.log('Countries with empty response:', emptyResponseCountries);
  })
  .catch(error => {
    console.error(error);
  });

