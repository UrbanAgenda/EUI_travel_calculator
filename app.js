let nutsHierarchy = [];
let travelBands = [];
let countryRates = {};

// ---------------------------
// Helpers
// ---------------------------

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

// ---------------------------
// Data loading
// ---------------------------

async function loadData() {
  try {
    const [nutsData, travelBandsData, countryRatesData] = await Promise.all([
      loadJson("./nuts_hierarchy_eu_2024.json"),
      loadJson("./travel_bands.json"),
      loadJson("./country_rates.json")
    ]);

    nutsHierarchy = nutsData;
    travelBands = travelBandsData;

    countryRates = Object.fromEntries(
      countryRatesData.map(item => [
        normalizeCountryCode(item.country_code),
        item
      ])
    );

    populateCountrySelect("origin");
    populateCountrySelect("destination");
  } catch (error) {
    console.error(error);
    showResult(
      `Could not load one or more JSON files.<br>
       Check that these files exist in the same folder as index.html:<br>
       <strong>nuts_hierarchy_eu_2024.json</strong>,
       <strong>travel_bands.json</strong>,
       <strong>country_rates.json</strong>`,
      true
    );
  }
}

// ---------------------------
// Cascading dropdowns
// ---------------------------

function getCountryData(countryCode) {
  return nutsHierarchy.find(
    item => normalizeCountryCode(item.country_code) === normalizeCountryCode(countryCode)
  );
}

function populateCountrySelect(prefix) {
  const select = document.getElementById(`${prefix}Country`);
  select.innerHTML = '<option value="">Select country</option>';

  nutsHierarchy.forEach(country => {
    const option = document.createElement("option");
    option.value = country.country_code;
    option.textContent = country.country_name;
    select.appendChild(option);
  });

  resetNuts2(prefix, "Select country first");
  resetNuts3(prefix, "Select NUTS 2 first");
}

function resetNuts2(prefix, message) {
  const select = document.getElementById(`${prefix}Nuts2`);
  select.innerHTML = `<option value="">${message}</option>`;
  select.disabled = true;
}

function resetNuts3(prefix, message) {
  const select = document.getElementById(`${prefix}Nuts3`);
  select.innerHTML = `<option value="">${message}</option>`;
  select.disabled = true;
}

function onCountryChange(prefix) {
  const countryCode = document.getElementById(`${prefix}Country`).value;
  const nuts2Select = document.getElementById(`${prefix}Nuts2`);

  resetNuts3(prefix, "Select NUTS 2 first");

  if (!countryCode) {
    resetNuts2(prefix, "Select country first");
    return;
  }

  const country = getCountryData(countryCode);
  if (!country) {
    resetNuts2(prefix, "No NUTS 2 found");
    return;
  }

  nuts2Select.innerHTML = '<option value="">Select NUTS 2</option>';
  country.nuts2.forEach(n2 => {
    const option = document.createElement("option");
    option.value = n2.nuts2_code;
    option.textContent = `${n2.nuts2_name} (${n2.nuts2_code})`;
    nuts2Select.appendChild(option);
  });
  nuts2Select.disabled = false;
}

function onNuts2Change(prefix) {
  const countryCode = document.getElementById(`${prefix}Country`).value;
  const nuts2Code = document.getElementById(`${prefix}Nuts2`).value;
  const nuts3Select = document.getElementById(`${prefix}Nuts3`);

  if (!countryCode || !nuts2Code) {
    resetNuts3(prefix, "Select NUTS 2 first");
    return;
  }

  const country = getCountryData(countryCode);
  const nuts2 = country?.nuts2.find(item => item.nuts2_code === nuts2Code);

  if (!nuts2 || !nuts2.nuts3?.length) {
    resetNuts3(prefix, "No NUTS 3 found");
    return;
  }

  nuts3Select.innerHTML = '<option value="">Select NUTS 3</option>';
  nuts2.nuts3.forEach(n3 => {
    const option = document.createElement("option");
    option.value = n3.nuts3_code;
    option.textContent = `${n3.nuts3_name} (${n3.nuts3_code})`;
    nuts3Select.appendChild(option);
  });
  nuts3Select.disabled = false;
}

function getSelectedNuts3(prefix) {
  const countryCode = document.getElementById(`${prefix}Country`).value;
  const nuts2Code = document.getElementById(`${prefix}Nuts2`).value;
  const nuts3Code = document.getElementById(`${prefix}Nuts3`).value;

  if (!countryCode || !nuts2Code || !nuts3Code) return null;

  const country = getCountryData(countryCode);
  const nuts2 = country?.nuts2.find(item => item.nuts2_code === nuts2Code);
  const nuts3 = nuts2?.nuts3.find(item => item.nuts3_code === nuts3Code);

  if (!country || !nuts2 || !nuts3) return null;

  return {
    country_code: country.country_code,
    country_name: country.country_name,
    nuts2_code: nuts2.nuts2_code,
    nuts2_name: nuts2.nuts2_name,
    nuts3_code: nuts3.nuts3_code,
    nuts3_name: nuts3.nuts3_name,
    lat: toNumber(nuts3.lat),
    lon: toNumber(nuts3.lon)
  };
}

// ---------------------------
// Travel rules
// ---------------------------

function findGenericTravelBand(distanceKm) {
  return travelBands.find(band => {
    const min = toNumber(band.min_km);
    const max = band.max_km === null ? Infinity : toNumber(band.max_km);
    return distanceKm >= min && distanceKm <= max;
  });
}

function getTravelRule(distanceKm, destinationCountryCode, isDomestic) {
  const country = countryRates[normalizeCountryCode(destinationCountryCode)];

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
      rule: "No travel amount found for this distance"
    };
  }

  const maxLabel = genericBand.max_km === null ? "∞" : genericBand.max_km;

  return {
    amount: toNumber(genericBand.amount_eur),
    rule: `${genericBand.min_km}-${maxLabel} km`
  };
}

// ---------------------------
// Main calculation
// ---------------------------

function calculateTravelAmount() {
  const origin = getSelectedNuts3("origin");
  const destination = getSelectedNuts3("destination");

  if (!origin || !destination) {
    showResult("Please select country, NUTS 2, and NUTS 3 for both origin and destination.", true);
    return;
  }

  const destinationRates = countryRates[normalizeCountryCode(destination.country_code)];

  if (!destinationRates) {
    showResult(`No country rates found for destination country: ${destination.country_code}`, true);
    return;
  }

  const distanceKm = haversineKm(origin.lat, origin.lon, destination.lat, destination.lon);
  const isDomestic = normalizeCountryCode(origin.country_code) === normalizeCountryCode(destination.country_code);
  const travelRule = getTravelRule(distanceKm, destination.country_code, isDomestic);

  showResult(`
    <div class="section-title">Travel details</div>
    <div><strong>Origin:</strong> ${origin.nuts3_name} (${origin.nuts3_code}), ${origin.nuts2_name}, ${origin.country_name}</div>
    <div><strong>Destination:</strong> ${destination.nuts3_name} (${destination.nuts3_code}), ${destination.nuts2_name}, ${destination.country_name}</div>
    <div><strong>Distance:</strong> ${distanceKm.toFixed(2)} km</div>
    <div><strong>Asssociated travel band:</strong> ${travelRule.rule}</div>

    <div class="section-title">Reimbursement for travel cost</div>
    <div class="total">${formatEuro(travelRule.amount)}</div>

    <div class="muted" style="margin-top: 12px;">
      Calculated for 1 participant.
    </div>
  `);
}

// ---------------------------
// Events
// ---------------------------

document.getElementById("originCountry").addEventListener("change", () => onCountryChange("origin"));
document.getElementById("originNuts2").addEventListener("change", () => onNuts2Change("origin"));

document.getElementById("destinationCountry").addEventListener("change", () => onCountryChange("destination"));
document.getElementById("destinationNuts2").addEventListener("change", () => onNuts2Change("destination"));

document.getElementById("calculateBtn").addEventListener("click", calculateTravelAmount);

loadData();