/**
 * Finance module SQL queries
 */

export const FinanceQueries = {
  getCompanyById: `
    SELECT id, name, balance, isMain, revenuePerKmEur
    FROM Company
    WHERE id = ?
  `,

  getJobsDistanceRange: `
    SELECT date, distance
    FROM Job
    WHERE status = 'APPROVED' AND date >= ? AND date <= ? AND userId IN (
      SELECT id FROM User WHERE companyId = ?
    )
  `,

  getJobsDistanceSum: `
    SELECT COALESCE(SUM(distance), 0) AS totalDistance
    FROM Job
    WHERE status = 'APPROVED' AND date >= ? AND date <= ? AND userId IN (
      SELECT id FROM User WHERE companyId = ?
    )
  `,

  getCompanyDriversBalances: `
    SELECT id, name, accountBalance
    FROM User
    WHERE companyId = ? AND driverStatus NOT IN ('WAITING_FOR_APPROVAL', 'INACTIVE')
  `
};
