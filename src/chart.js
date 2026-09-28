import Chart from 'chart.js/auto';

let chart = null;

export function renderChart(canvas, { labels, solar, before, after }) {
  if (chart) chart.destroy();
  chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Solar output (kW)',
          data: solar,
          backgroundColor: 'rgba(245, 180, 30, 0.55)',
          order: 3,
        },
        {
          type: 'line',
          label: 'Appliances at usual times (kW)',
          data: before,
          borderColor: '#b3261e',
          stepped: true,
          pointRadius: 0,
          borderWidth: 2,
          order: 2,
        },
        {
          type: 'line',
          label: 'Appliances with SunShift (kW)',
          data: after,
          borderColor: '#1f7a3d',
          stepped: true,
          pointRadius: 0,
          borderWidth: 3,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'kW' } },
        x: { ticks: { maxTicksLimit: 12 } },
      },
      plugins: { legend: { position: 'bottom' } },
    },
  });
}