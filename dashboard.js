// State Management
const state = {
  data: [],
  filteredData: [],
  filters: {
    hotelType: 'all',
    status: 'all',
    year: 'all',
    month: 'all',
    segment: 'all'
  },
  table: {
    search: '',
    page: 1,
    pageSize: 10,
    sortColumn: 'arrival',
    sortDirection: 'desc'
  },
  theme: 'light'
};

// Global Chart references
const charts = {
  trends: null,
  segment: null,
  countries: null,
  customer: null,
  roomAdr: null
};

// Month conversion helpers
const monthMap = {
  'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5,
  'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadData();
  setupEventListeners();
  lucide.createIcons();
});

// Theme Management
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  setTheme(savedTheme);
  
  const themeToggle = document.getElementById('theme-toggle');
  themeToggle.addEventListener('click', () => {
    const newTheme = state.theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    updateChartsTheme();
  });
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  
  const themeToggle = document.getElementById('theme-toggle');
  const themeText = document.getElementById('theme-text');
  const existingIcon = themeToggle.querySelector('[data-lucide]');
  const newIcon = document.createElement('i');
  newIcon.id = 'theme-icon';
  
  if (theme === 'dark') {
    newIcon.setAttribute('data-lucide', 'sun');
    themeText.textContent = 'Light Mode';
  } else {
    newIcon.setAttribute('data-lucide', 'moon');
    themeText.textContent = 'Dark Mode';
  }
  
  if (existingIcon) {
    existingIcon.replaceWith(newIcon);
  }
  
  lucide.createIcons();
}

// Custom stream fetcher to report load progress
async function loadData() {
  const loaderStatus = document.getElementById('loader-status');
  const loaderProgress = document.getElementById('loader-progress');
  const startTime = performance.now();

  try {
    const response = await fetch('hotel_booking.csv');
    if (!response.ok) throw new Error('Network response was not OK');

    const contentLength = response.headers.get('content-length');
    if (!contentLength) {
      loaderStatus.textContent = 'Downloading data (size unknown)...';
    }

    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
    let loadedBytes = 0;

    const reader = response.body.getReader();
    const chunks = [];
    
    while(true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      chunks.push(value);
      loadedBytes += value.length;
      
      if (totalBytes > 0) {
        const percent = Math.round((loadedBytes / totalBytes) * 100);
        loaderProgress.style.width = `${percent}%`;
        loaderStatus.textContent = `Downloading dataset: ${percent}% (${(loadedBytes / (1024 * 1024)).toFixed(1)} MB / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB)`;
      } else {
        loaderStatus.textContent = `Downloading dataset: ${(loadedBytes / (1024 * 1024)).toFixed(1)} MB`;
      }
    }

    loaderStatus.textContent = 'Parsing CSV payload...';
    // Concatenate chunks into a single string
    let bytes = new Uint8Array(loadedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const csvString = new TextDecoder('utf-8').decode(bytes);

    // Parse CSV in JS using PapaParse
    Papa.parse(csvString, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const endTime = performance.now();
        const loadDuration = ((endTime - startTime) / 1000).toFixed(2);
        
        // Post-process rows to set numbers correctly
        state.data = results.data.map(row => {
          const isCanceled = parseInt(row.is_canceled, 10) || 0;
          const leadTime = parseInt(row.lead_time, 10) || 0;
          const year = parseInt(row.arrival_date_year, 10) || 0;
          const day = parseInt(row.arrival_date_day_of_month, 10) || 0;
          const weekendNights = parseInt(row.stays_in_weekend_nights, 10) || 0;
          const weekNights = parseInt(row.stays_in_week_nights, 10) || 0;
          const adults = parseInt(row.adults, 10) || 0;
          const children = parseFloat(row.children) || 0;
          const babies = parseInt(row.babies, 10) || 0;
          const adr = parseFloat(row.adr) || 0;

          // Synthesize arrival date for sorting and displaying
          // Schema format: 2015-July-1
          const monthIndex = monthMap[row.arrival_date_month] !== undefined ? monthMap[row.arrival_date_month] : 0;
          const arrivalDate = new Date(year, monthIndex, day);

          return {
            ...row,
            is_canceled: isCanceled,
            lead_time: leadTime,
            arrival_date_year: year,
            arrival_date_day_of_month: day,
            stays_in_weekend_nights: weekendNights,
            stays_in_week_nights: weekNights,
            adults: adults,
            children: children,
            babies: babies,
            adr: adr,
            arrivalDate: arrivalDate
          };
        });

        // Hide Loader
        const loader = document.getElementById('loader');
        loader.classList.add('hidden');

        // Update status badge
        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('status-text');
        statusDot.classList.add('active');
        statusText.textContent = `Active (${state.data.length.toLocaleString()} rows, parsed in ${loadDuration}s)`;
        
        document.getElementById('sidebar-row-count').textContent = `Total: ${state.data.length.toLocaleString()}`;

        // Initial Filter & Render
        applyFilters();
      },
      error: (err) => {
        loaderStatus.textContent = `Error parsing CSV: ${err.message}`;
        console.error(err);
      }
    });

  } catch (error) {
    loaderStatus.textContent = `Error loading file: ${error.message}`;
    console.error(error);
  }
}

// Event Listeners for Filters and Table Inputs
function setupEventListeners() {
  // Filters dropdowns
  document.getElementById('filter-hotel-type').addEventListener('change', (e) => {
    state.filters.hotelType = e.target.value;
    applyFilters();
  });

  document.getElementById('filter-status').addEventListener('change', (e) => {
    state.filters.status = e.target.value;
    applyFilters();
  });

  document.getElementById('filter-year').addEventListener('change', (e) => {
    state.filters.year = e.target.value;
    applyFilters();
  });

  document.getElementById('filter-month').addEventListener('change', (e) => {
    state.filters.month = e.target.value;
    applyFilters();
  });

  document.getElementById('filter-segment').addEventListener('change', (e) => {
    state.filters.segment = e.target.value;
    applyFilters();
  });

  // Reset Filters Button
  document.getElementById('reset-filters-btn').addEventListener('click', () => {
    document.getElementById('filter-hotel-type').value = 'all';
    document.getElementById('filter-status').value = 'all';
    document.getElementById('filter-year').value = 'all';
    document.getElementById('filter-month').value = 'all';
    document.getElementById('filter-segment').value = 'all';

    state.filters = {
      hotelType: 'all',
      status: 'all',
      year: 'all',
      month: 'all',
      segment: 'all'
    };
    applyFilters();
  });

  // Table search
  document.getElementById('table-search').addEventListener('input', (e) => {
    state.table.search = e.target.value.toLowerCase().trim();
    state.table.page = 1; // Reset to page 1 on search
    renderTable();
  });

  // Table sorting triggers
  const sortingHeaders = [
    { id: 'th-name', key: 'name' },
    { id: 'th-email', key: 'email' },
    { id: 'th-hotel', key: 'hotel' },
    { id: 'th-lead', key: 'lead_time' },
    { id: 'th-arrival', key: 'arrivalDate' },
    { id: 'th-adr', key: 'adr' },
    { id: 'th-room', key: 'reserved_room_type' },
    { id: 'th-status', key: 'reservation_status' }
  ];

  sortingHeaders.forEach(header => {
    const el = document.getElementById(header.id);
    if (el) {
      el.addEventListener('click', () => {
        if (state.table.sortColumn === header.key) {
          state.table.sortDirection = state.table.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          state.table.sortColumn = header.key;
          state.table.sortDirection = 'asc';
        }
        
        // Reset header icons
        sortingHeaders.forEach(h => {
          const iconEl = document.querySelector(`#${h.id} [data-lucide]`);
          if (iconEl) {
            const newIcon = document.createElement('i');
            newIcon.setAttribute('data-lucide', 'chevrons-up-down');
            iconEl.replaceWith(newIcon);
          }
        });

        // Set active header icon
        const activeArrow = document.querySelector(`#${header.id} [data-lucide]`);
        if (activeArrow) {
          const newIcon = document.createElement('i');
          newIcon.setAttribute('data-lucide', state.table.sortDirection === 'asc' ? 'chevron-up' : 'chevron-down');
          activeArrow.replaceWith(newIcon);
        }
        lucide.createIcons();
        
        renderTable();
      });
    }
  });
}

// Core Data Filter Engine
function applyFilters() {
  state.filteredData = state.data.filter(row => {
    // Hotel Type filter
    if (state.filters.hotelType !== 'all' && row.hotel !== state.filters.hotelType) {
      return false;
    }

    // Booking Status filter
    if (state.filters.status !== 'all') {
      const isCanceled = row.is_canceled === 1;
      const resStatus = row.reservation_status.toLowerCase();
      if (state.filters.status === 'active' && isCanceled) return false;
      if (state.filters.status === 'canceled' && (!isCanceled || resStatus !== 'canceled')) return false;
      if (state.filters.status === 'no-show' && (!isCanceled || resStatus !== 'no-show')) return false;
    }

    // Year filter
    if (state.filters.year !== 'all' && row.arrival_date_year !== parseInt(state.filters.year, 10)) {
      return false;
    }

    // Month filter
    if (state.filters.month !== 'all' && row.arrival_date_month !== state.filters.month) {
      return false;
    }

    // Market Segment filter
    if (state.filters.segment !== 'all' && row.market_segment !== state.filters.segment) {
      return false;
    }

    return true;
  });

  // Reset pagination page
  state.table.page = 1;

  // Re-calculate KPIs & Render Dashboard Elements
  calculateKPIs();
  updateCharts();
  renderTable();
}

// KPI Calculation
function calculateKPIs() {
  const total = state.filteredData.length;
  document.getElementById('kpi-total-bookings').textContent = total.toLocaleString();

  let canceledCount = 0;
  let totalLeadTime = 0;
  let totalADR = 0;
  let revenue = 0;
  let guests = 0;

  state.filteredData.forEach(row => {
    if (row.is_canceled === 1) {
      canceledCount++;
    } else {
      // Estimated occupied nights revenue
      const staysCount = row.stays_in_weekend_nights + row.stays_in_week_nights;
      revenue += row.adr * (staysCount || 1); // If 0 nights (e.g. Day use), charge at least 1 day ADR
    }
    
    totalLeadTime += row.lead_time;
    totalADR += row.adr;
    guests += row.adults + row.children + row.babies;
  });

  const cancelRate = total > 0 ? ((canceledCount / total) * 100).toFixed(1) : '0.0';
  document.getElementById('kpi-cancellation-rate').textContent = `${cancelRate}%`;
  document.getElementById('kpi-cancellation-count').textContent = `${canceledCount.toLocaleString()} cancellations`;

  document.getElementById('kpi-revenue').textContent = total > 0 ? `$${Math.round(revenue).toLocaleString()}` : '$0';
  
  const avgLeadTime = total > 0 ? Math.round(totalLeadTime / total) : 0;
  document.getElementById('kpi-lead-time').textContent = `${avgLeadTime}d`;

  const avgADR = total > 0 ? (totalADR / total).toFixed(2) : '0.00';
  document.getElementById('kpi-adr').textContent = `$${avgADR}`;

  document.getElementById('kpi-guests').textContent = guests.toLocaleString();
}

// Fetch Chart.js font & grid colors based on theme
function getChartColors() {
  const isDark = state.theme === 'dark';
  return {
    gridColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
    textColor: isDark ? '#94a3b8' : '#64748b',
    tooltipBg: isDark ? '#1e293b' : '#ffffff',
    tooltipBorder: isDark ? '#334155' : '#e2e8f0',
    tooltipText: isDark ? '#f8fafc' : '#1f2937'
  };
}

// Chart.js updates
function updateCharts() {
  const chartColors = getChartColors();

  // --- 1. Monthly Trends Chart (Bookings & Cancellations) ---
  const trendsData = {};
  state.filteredData.forEach(row => {
    // Key format: YYYY-MM (e.g. 2015-07)
    const monthIndex = monthMap[row.arrival_date_month] !== undefined ? monthMap[row.arrival_date_month] : 0;
    const monthNum = String(monthIndex + 1).padStart(2, '0');
    const key = `${row.arrival_date_year}-${monthNum}`;
    const label = `${row.arrival_date_month.substring(0, 3)} ${row.arrival_date_year}`;
    
    if (!trendsData[key]) {
      trendsData[key] = { label, total: 0, canceled: 0 };
    }
    trendsData[key].total++;
    if (row.is_canceled === 1) {
      trendsData[key].canceled++;
    }
  });

  // Sort chronological keys
  const sortedTrendKeys = Object.keys(trendsData).sort();
  const trendLabels = sortedTrendKeys.map(k => trendsData[k].label);
  const trendTotals = sortedTrendKeys.map(k => trendsData[k].total);
  const trendCancellations = sortedTrendKeys.map(k => trendsData[k].canceled);

  if (charts.trends) {
    charts.trends.data.labels = trendLabels;
    charts.trends.data.datasets[0].data = trendTotals;
    charts.trends.data.datasets[1].data = trendCancellations;
    charts.trends.update();
  } else {
    const ctx = document.getElementById('chart-trends').getContext('2d');
    charts.trends = new Chart(ctx, {
      type: 'line',
      data: {
        labels: trendLabels,
        datasets: [
          {
            label: 'Total Bookings',
            data: trendTotals,
            borderColor: 'rgba(99, 102, 241, 1)',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
          },
          {
            label: 'Cancellations',
            data: trendCancellations,
            borderColor: 'rgba(239, 68, 68, 1)',
            backgroundColor: 'rgba(239, 68, 68, 0.05)',
            borderWidth: 2,
            fill: true,
            tension: 0.35,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: chartColors.textColor } }
        },
        scales: {
          x: { grid: { color: chartColors.gridColor }, ticks: { color: chartColors.textColor } },
          y: { grid: { color: chartColors.gridColor }, ticks: { color: chartColors.textColor } }
        }
      }
    });
  }

  // --- 2. Market Segment (Doughnut) ---
  const segments = {};
  state.filteredData.forEach(row => {
    const seg = row.market_segment || 'Undefined';
    segments[seg] = (segments[seg] || 0) + 1;
  });

  const segmentLabels = Object.keys(segments);
  const segmentValues = Object.values(segments);

  if (charts.segment) {
    charts.segment.data.labels = segmentLabels;
    charts.segment.data.datasets[0].data = segmentValues;
    charts.segment.update();
  } else {
    const ctx = document.getElementById('chart-segment').getContext('2d');
    charts.segment = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: segmentLabels,
        datasets: [{
          data: segmentValues,
          backgroundColor: [
            'rgba(99, 102, 241, 0.85)',
            'rgba(6, 182, 212, 0.85)',
            'rgba(16, 185, 129, 0.85)',
            'rgba(245, 158, 11, 0.85)',
            'rgba(239, 68, 68, 0.85)',
            'rgba(139, 92, 246, 0.85)',
            'rgba(244, 63, 94, 0.85)',
            'rgba(100, 116, 139, 0.85)'
          ],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: chartColors.textColor, boxWidth: 12 } }
        }
      }
    });
  }

  // --- 3. Top 10 Countries (Horizontal Bar) ---
  const countries = {};
  state.filteredData.forEach(row => {
    const c = row.country || 'Unknown';
    countries[c] = (countries[c] || 0) + 1;
  });

  // Sort descending and slice top 10
  const sortedCountries = Object.entries(countries)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const countryLabels = sortedCountries.map(x => x[0]);
  const countryValues = sortedCountries.map(x => x[1]);

  if (charts.countries) {
    charts.countries.data.labels = countryLabels;
    charts.countries.data.datasets[0].data = countryValues;
    charts.countries.update();
  } else {
    const ctx = document.getElementById('chart-countries').getContext('2d');
    charts.countries = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: countryLabels,
        datasets: [{
          label: 'Bookings Count',
          data: countryValues,
          backgroundColor: 'rgba(6, 182, 212, 0.8)',
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: chartColors.gridColor }, ticks: { color: chartColors.textColor } },
          y: { grid: { display: false }, ticks: { color: chartColors.textColor } }
        }
      }
    });
  }

  // --- 4. Customer Type breakdown (Pie) ---
  const customers = {};
  state.filteredData.forEach(row => {
    const cType = row.customer_type || 'Transient';
    customers[cType] = (customers[cType] || 0) + 1;
  });

  const customerLabels = Object.keys(customers);
  const customerValues = Object.values(customers);

  if (charts.customer) {
    charts.customer.data.labels = customerLabels;
    charts.customer.data.datasets[0].data = customerValues;
    charts.customer.update();
  } else {
    const ctx = document.getElementById('chart-customer').getContext('2d');
    charts.customer = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: customerLabels,
        datasets: [{
          data: customerValues,
          backgroundColor: [
            'rgba(99, 102, 241, 0.8)',
            'rgba(16, 185, 129, 0.8)',
            'rgba(245, 158, 11, 0.8)',
            'rgba(100, 116, 139, 0.8)'
          ],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: chartColors.textColor, boxWidth: 12 } }
        }
      }
    });
  }

  // --- 5. ADR by Reserved Room Type (Vertical Bar) ---
  const roomRates = {};
  state.filteredData.forEach(row => {
    const room = row.reserved_room_type || 'Unknown';
    if (!roomRates[room]) {
      roomRates[room] = { sum: 0, count: 0 };
    }
    roomRates[room].sum += row.adr;
    roomRates[room].count++;
  });

  // Calculate average ADR for each room, sorted alphabetically
  const roomLabels = Object.keys(roomRates).sort();
  const roomAdrValues = roomLabels.map(room => {
    const avg = roomRates[room].sum / roomRates[room].count;
    return parseFloat(avg.toFixed(2));
  });

  if (charts.roomAdr) {
    charts.roomAdr.data.labels = roomLabels;
    charts.roomAdr.data.datasets[0].data = roomAdrValues;
    charts.roomAdr.update();
  } else {
    const ctx = document.getElementById('chart-room-adr').getContext('2d');
    charts.roomAdr = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: roomLabels,
        datasets: [{
          label: 'Average Daily Rate ($)',
          data: roomAdrValues,
          backgroundColor: 'rgba(99, 102, 241, 0.85)',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: chartColors.textColor } },
          y: { grid: { color: chartColors.gridColor }, ticks: { color: chartColors.textColor } }
        }
      }
    });
  }
}

// Re-styling charts theme properties dynamically
function updateChartsTheme() {
  const chartColors = getChartColors();
  const optionsUpdates = {
    plugins: {
      legend: { labels: { color: chartColors.textColor } }
    },
    scales: {
      x: { grid: { color: chartColors.gridColor }, ticks: { color: chartColors.textColor } },
      y: { grid: { color: chartColors.gridColor }, ticks: { color: chartColors.textColor } }
    }
  };

  Object.values(charts).forEach(chart => {
    if (chart) {
      // Line and Bar charts have scales
      if (chart.config.type === 'line' || chart.config.type === 'bar') {
        chart.options.scales.x.grid.color = chartColors.gridColor;
        chart.options.scales.x.ticks.color = chartColors.textColor;
        chart.options.scales.y.grid.color = chartColors.gridColor;
        chart.options.scales.y.ticks.color = chartColors.textColor;
      }
      
      // All charts legends
      if (chart.options.plugins && chart.options.plugins.legend) {
        chart.options.plugins.legend.labels.color = chartColors.textColor;
      }
      chart.update();
    }
  });
}

// Directory Lookup Table Rendering with Search, Sort, and Pagination
function renderTable() {
  const tbody = document.getElementById('bookings-table-body');
  
  // 1. Keyword search filtering
  let finalTableRows = state.filteredData;
  if (state.table.search) {
    const q = state.table.search;
    finalTableRows = state.filteredData.filter(row => {
      return (
        (row.name && row.name.toLowerCase().includes(q)) ||
        (row.email && row.email.toLowerCase().includes(q)) ||
        (row['phone-number'] && row['phone-number'].includes(q)) ||
        (row.country && row.country.toLowerCase().includes(q))
      );
    });
  }

  // 2. Sort column values
  const col = state.table.sortColumn;
  const dir = state.table.sortDirection === 'asc' ? 1 : -1;

  finalTableRows.sort((a, b) => {
    let valA = a[col];
    let valB = b[col];

    if (valA === undefined) valA = '';
    if (valB === undefined) valB = '';

    if (typeof valA === 'string') {
      return valA.localeCompare(valB) * dir;
    }
    
    if (valA instanceof Date) {
      return (valA.getTime() - valB.getTime()) * dir;
    }

    // Numeric comparison
    return (valA - valB) * dir;
  });

  // 3. Paginate
  const totalEntries = finalTableRows.length;
  const totalPages = Math.ceil(totalEntries / state.table.pageSize) || 1;
  
  // Bound check
  if (state.table.page > totalPages) state.table.page = totalPages;
  if (state.table.page < 1) state.table.page = 1;

  const startIndex = (state.table.page - 1) * state.table.pageSize;
  const endIndex = Math.min(startIndex + state.table.pageSize, totalEntries);
  const pageRows = finalTableRows.slice(startIndex, endIndex);

  // Render Rows HTML
  if (pageRows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 32px; color: var(--text-secondary);">
          No matching records found.
        </td>
      </tr>
    `;
    document.getElementById('table-pagination-info').textContent = 'Showing 0 to 0 of 0 entries';
    document.getElementById('table-pagination-controls').innerHTML = '';
    return;
  }

  tbody.innerHTML = pageRows.map(row => {
    // Arrival date pretty print
    const dateStr = row.arrivalDate.toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });

    // Badge styling for reservation status
    let statusClass = 'badge-success';
    if (row.is_canceled === 1) {
      statusClass = row.reservation_status.toLowerCase() === 'no-show' ? 'badge-warning' : 'badge-danger';
    }

    return `
      <tr>
        <td style="font-weight: 500;">${row.name || 'N/A'}</td>
        <td style="color: var(--text-secondary);">${row.email || 'N/A'}</td>
        <td>${row['phone-number'] || 'N/A'}</td>
        <td>${row.hotel}</td>
        <td>${row.lead_time} days</td>
        <td>${dateStr}</td>
        <td style="font-weight: 600;">$${row.adr.toFixed(2)}</td>
        <td style="text-align: center;"><span style="background: var(--bg-primary); padding: 4px 8px; border-radius: 4px; font-weight: 500;">${row.reserved_room_type}</span></td>
        <td>
          <span class="badge ${statusClass}">
            ${row.reservation_status}
          </span>
        </td>
      </tr>
    `;
  }).join('');

  // Update table info details text
  document.getElementById('table-pagination-info').textContent = 
    `Showing ${startIndex + 1} to ${endIndex} of ${totalEntries.toLocaleString()} entries`;

  // Render beautiful pagination numbers
  renderPaginationControls(totalPages);
}

// Generate smart pagination links (...)
function renderPaginationControls(totalPages) {
  const container = document.getElementById('table-pagination-controls');
  const currentPage = state.table.page;
  
  let html = '';

  // Prev Button
  html += `
    <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">
      <i data-lucide="chevron-left" style="width: 16px; height: 16px;"></i>
    </button>
  `;

  // Smart page numbers
  const maxVisiblePages = 5;
  if (totalPages <= maxVisiblePages) {
    for (let i = 1; i <= totalPages; i++) {
      html += renderPageNumberBtn(i, currentPage);
    }
  } else {
    // Output complex pages with dots
    if (currentPage <= 3) {
      for (let i = 1; i <= 4; i++) {
        html += renderPageNumberBtn(i, currentPage);
      }
      html += `<span class="pagination-dots">...</span>`;
      html += renderPageNumberBtn(totalPages, currentPage);
    } else if (currentPage >= totalPages - 2) {
      html += renderPageNumberBtn(1, currentPage);
      html += `<span class="pagination-dots">...</span>`;
      for (let i = totalPages - 3; i <= totalPages; i++) {
        html += renderPageNumberBtn(i, currentPage);
      }
    } else {
      html += renderPageNumberBtn(1, currentPage);
      html += `<span class="pagination-dots">...</span>`;
      html += renderPageNumberBtn(currentPage - 1, currentPage);
      html += renderPageNumberBtn(currentPage, currentPage);
      html += renderPageNumberBtn(currentPage + 1, currentPage);
      html += `<span class="pagination-dots">...</span>`;
      html += renderPageNumberBtn(totalPages, currentPage);
    }
  }

  // Next Button
  html += `
    <button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">
      <i data-lucide="chevron-right" style="width: 16px; height: 16px;"></i>
    </button>
  `;

  container.innerHTML = html;
  lucide.createIcons();
}

function renderPageNumberBtn(pageNum, currentPage) {
  const activeClass = pageNum === currentPage ? 'active' : '';
  return `<button class="page-btn ${activeClass}" onclick="changePage(${pageNum})">${pageNum}</button>`;
}

// Global scope helpers for onclick attributes in html string
window.changePage = (pageNum) => {
  state.table.page = pageNum;
  renderTable();
};
