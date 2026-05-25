const { createWorker } = require("./workerFactory");
const logger = require("../config/logger");

// Simulate report generation (swap with real PDF/CSV lib in production)
const generateReport = async (type, data, progressCb) => {
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    await new Promise((res) => setTimeout(res, Math.random() * 400 + 100));
    await progressCb(Math.round((i / steps) * 100));
  }

  // Simulate 3% failure rate
  if (Math.random() < 0.03) throw new Error("Report generation timeout");

  return {
    reportId: `rpt_${Date.now()}`,
    type,
    recordCount: data.filters ? Math.floor(Math.random() * 10000) : 0,
    fileSize: `${(Math.random() * 5 + 0.5).toFixed(1)}MB`,
    downloadUrl: `/reports/rpt_${Date.now()}.${type}`,
    generatedAt: new Date(),
  };
};

const reportProcessor = async (job) => {
  const { name, data } = job;
  const progress = (pct) => job.updateProgress(pct);

  switch (name) {
    case "generate-pdf-report": {
      const { reportType, dateRange, filters } = data;
      if (!reportType) throw new Error("Missing reportType");
      logger.debug(`📄 Generating PDF: ${reportType}`);
      return generateReport("pdf", { reportType, dateRange, filters }, progress);
    }

    case "generate-csv-export": {
      const { entity, filters } = data;
      if (!entity) throw new Error("Missing entity for CSV export");
      logger.debug(`📊 Generating CSV export for: ${entity}`);
      return generateReport("csv", { entity, filters }, progress);
    }

    case "generate-analytics": {
      const { metric, period } = data;
      if (!metric) throw new Error("Missing metric");
      logger.debug(`📈 Generating analytics: ${metric} for ${period}`);

      // Analytics is heavier — more steps
      const result = await generateReport("json", { metric, period }, progress);
      return { ...result, metric, period, insights: ["Peak at 14:00", "20% growth MoM"] };
    }

    case "generate-daily-digest": {
      const { date, recipients } = data;
      logger.debug(`📰 Generating daily digest for ${date}`);
      const report = await generateReport("html", { date }, progress);
      return { ...report, recipients: recipients?.length || 0, date };
    }

    default:
      throw new Error(`Unknown report job: ${name}`);
  }
};

const reportWorker = createWorker("report", reportProcessor, { concurrency: 3 });

module.exports = reportWorker;
