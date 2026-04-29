let cities = [];
let travelBands = [];
let countryRates = {};

const STAFF_COST_PER_PERSON = 350;

function showResult(html, isError = false) {
  const resultDiv = document.getElementById("result");
  resultDiv.style.display = "block";
  resultDiv.className = isError ? "result error" : "result";
  resultDiv.innerHTML = html;
}

function formatEuro(value) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR"
  }).format(value);
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeCountryCode(code) {
  if (!code) return "";
  const upper = String(code).trim().toUpperCase();
  if (upper === "GR") return "EL";
  return upper;
}

function getCityName(city) {
  return city.city || city.URAU_NAME || city.name || "Unknown city";
}

function getCountryCode(city) {
  return normalizeCountryCode(
    city.country_code || city.CNTR_CODE || city.country || ""
  );
}

function getLatitude(city) {
  return toNumber(city.lat ?? city.latitude ?? city.y);
}

function getLongitude(city) {
  return toNumber(city.lon ?? city.lng ?? city.longitude ?? city.x);
}

function getCityLabel(city) {
  if (city.label) return city.label;
  const cityName = getCityName(city);
  const cc = getCountryCode(city);
  return cc ? `${cityName} (${cc})` : cityName;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = deg => deg * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Could not load ${path}`);
  }
  return response.json();
}

async function loadData() {
  try {
    const [citiesData, travelBandsData, countryRatesData] = await Promise.all([
      loadJson("./citiesua_eurostats_sample.json"),
      loadJson("./travel_bands.json"),
      loadJson("./country_rates.json")
    ]);

    cities = citiesData;
    travelBands = travelBandsData;

    countryRates = Object.fromEntries(
      countryRatesData.map(item => [
        normalizeCountryCode(item.country_code),
        item
      ])
    );

    populateCitySelects();
  } catch (error) {
    console.error(error);
    showResult(
      `Could not load one or more JSON files.<br>
       Check that these files exist in the same folder as index.html:<br>
       <strong>citiesua_eurostats_sample.json</strong>, 
       <strong>travel_bands.json</strong>, 
       <strong>country_rates.json</strong>`,
      true
    );
  }
}

function populateCitySelects() {
  const originSelect = document.getElementById("origin");
  const destinationSelect = document.getElementById("destination");

  originSelect.innerHTML = '<option value="">Select origin</option>';
  destinationSelect.innerHTML = '<option value="">Select destination</option>';

  cities.forEach((city, index) => {
    const label = getCityLabel(city);

    const option1 = document.createElement("option");
    option1.value = index;
    option1.textContent = label;
    originSelect.appendChild(option1);

    const option2 = document.createElement("option");
    option2.value = index;
    option2.textContent = label;
    destinationSelect.appendChild(option2);
  });
}

function findGenericTravelBand(distanceKm) {
  return travelBands.find(band => {
    const min = toNumber(band.min_km);
    const max = band.max_km === null ? Infinity : toNumber(band.max_km);
    return distanceKm >= min && distanceKm <= max;
  });
}

function getTravelRule(distanceKm, destinationCountryCode, isDomestic) {
  const country = countryRates[destinationCountryCode];

  if (!country) {
    return {
      amount: 0,
      rule: `No country rates found for ${destinationCountryCode}`
    };
  }

  if (isDomestic && distanceKm >= 50 && distanceKm < 400) {
    return {
      amount: toNumber(country.domestic_50_400),
      rule: `${country.country}: intra-Member State travel (50-400 km)`
    };
  }

  if (distanceKm >= 400 && distanceKm <= 600) {
    const specialAmount = toNumber(country.band_400_600);

    if (specialAmount > 0) {
      return {
        amount: specialAmount,
        rule: `${country.country}: country-specific return trip (400-600 km)`
      };
    }

    const genericBand = findGenericTravelBand(distanceKm);
    if (genericBand) {
      return {
        amount: toNumber(genericBand.amount_eur),
        rule: `Generic return trip (400-600 km)`
      };
    }
  }

  const genericBand = findGenericTravelBand(distanceKm);

  if (!genericBand) {
    return {
      amount: 0,
      rule: "No travel band found"
    };
  }

  const maxLabel = genericBand.max_km === null ? "∞" : genericBand.max_km;

  return {
    amount: toNumber(genericBand.amount_eur),
    rule: `Generic return trip (${genericBand.min_km}-${maxLabel} km)`
  };
}

function calculateReimbursement() {
  const originIndex = document.getElementById("origin").value;
  const destinationIndex = document.getElementById("destination").value;
  const persons = toNumber(document.getElementById("persons").value);
  const days = toNumber(document.getElementById("days").value);

  if (originIndex === "" || destinationIndex === "") {
    showResult("Please select both cities.", true);
    return;
  }

  if (persons < 1) {
    showResult("Please enter a valid number of persons.", true);
    return;
  }

  if (days < 1) {
    showResult("Please enter a valid number of days.", true);
    return;
  }

  const origin = cities[Number(originIndex)];
  const destination = cities[Number(destinationIndex)];

  const originLat = getLatitude(origin);
  const originLon = getLongitude(origin);
  const destLat = getLatitude(destination);
  const destLon = getLongitude(destination);

  const originCountryCode = getCountryCode(origin);
  const destinationCountryCode = getCountryCode(destination);

  if (!originCountryCode || !destinationCountryCode) {
    showResult("Country code missing in one of the selected cities.", true);
    return;
  }

  const destinationRates = countryRates[destinationCountryCode];

  if (!destinationRates) {
    showResult(`No country rates found for destination country: ${destinationCountryCode}`, true);
    return;
  }

  const distanceKm = haversineKm(originLat, originLon, destLat, destLon);
  const isDomestic = originCountryCode === destinationCountryCode;

  const travelRule = getTravelRule(distanceKm, destinationCountryCode, isDomestic);

  const staffCost = persons * STAFF_COST_PER_PERSON;
  const travelCost = travelRule.amount * persons;
  const perDiem = persons * days * toNumber(destinationRates.per_diem);
  const total = staffCost + travelCost + perDiem;

  showResult(`
    <div class="section-title">Trip details</div>
    <div><strong>Route:</strong> ${getCityLabel(origin)} → ${getCityLabel(destination)}</div>
    <div><strong>Distance:</strong> ${distanceKm.toFixed(2)} km</div>
    <div><strong>Persons:</strong> ${persons}</div>
    <div><strong>Days:</strong> ${days}</div>
    <div><strong>Country used for rates:</strong> ${destinationRates.country}</div>
    <div><strong>Travel rule used:</strong> ${travelRule.rule}</div>

    <div class="section-title">Cost breakdown</div>
    <div>Staff cost = ${persons} × ${formatEuro(STAFF_COST_PER_PERSON)} = <strong>${formatEuro(staffCost)}</strong></div>
    <div>Travel cost = ${persons} × ${formatEuro(travelRule.amount)} = <strong>${formatEuro(travelCost)}</strong></div>
    <div>Per diem = ${persons} × ${days} × ${formatEuro(destinationRates.per_diem)} = <strong>${formatEuro(perDiem)}</strong></div>

    <div class="section-title">Total</div>
    <div class="total">${formatEuro(total)}</div>
  `);
}

document.getElementById("calculateBtn").addEventListener("click", calculateReimbursement);
loadData();