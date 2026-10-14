/**
 * lib/rentalPolicy.js
 *
 * Enforces Natya Vastra Bharatanatyam costume rental policies:
 * 1. Standard costume rental: ₹650 for one day.
 * 2. Saree costume rental: ₹1,500 per order (or special order rules).
 * 3. Late return penalty: ₹250 when returned after agreed deadline.
 * 4. Damage charges: administrator inspects, proposes charge for review. Never auto-deducted.
 */

const STANDARD_RENT_PER_DAY = 650;
const SAREE_RENT_PER_ORDER = 1500;
const LATE_RETURN_PENALTY = 250;
const DEFAULT_RETURN_TIME = '20:00:00'; // 8:00 PM on return day

/**
 * Returns the agreed return deadline ISO-like string.
 * Defaults to 8:00 PM on the booking end date.
 */
function computeReturnDeadline(endDate, returnTime = DEFAULT_RETURN_TIME) {
  if (!endDate) return null;
  // If endDate already has time, return as is
  if (endDate.includes('T')) return endDate;
  return `${endDate}T${returnTime}`;
}

/**
 * Determine whether a return is late and calculate fee.
 *
 * @param {{
 *   rentalPrice: number,
 *   returnDeadline: string,
 *   actualReturnTime?: string | null,
 *   approvedDamageCharge?: number,
 *   manualLatePenalty?: number | null
 * }} params
 */
function calculateReturnStatusAndFees({
  rentalPrice,
  returnDeadline,
  actualReturnTime,
  approvedDamageCharge = 0,
  manualLatePenalty = null
}) {
  const baseRental = Number(rentalPrice) || STANDARD_RENT_PER_DAY;
  const damageCharge = Math.max(0, Number(approvedDamageCharge) || 0);

  if (!actualReturnTime) {
    return {
      returnStatus: 'not_returned',
      isLate: false,
      latePenalty: 0,
      originalRentalPrice: baseRental,
      damageCharge,
      totalAmount: baseRental + damageCharge
    };
  }

  const deadlineMs = new Date(returnDeadline).getTime();
  const actualMs = new Date(actualReturnTime).getTime();

  let isLate = false;
  let latePenalty = 0;

  if (manualLatePenalty !== null && manualLatePenalty !== undefined) {
    latePenalty = Math.max(0, Number(manualLatePenalty));
    isLate = latePenalty > 0;
  } else {
    isLate = actualMs > deadlineMs;
    latePenalty = isLate ? LATE_RETURN_PENALTY : 0;
  }

  const returnStatus = isLate ? 'returned_late' : 'returned_on_time';
  const totalAmount = baseRental + latePenalty + damageCharge;

  return {
    returnStatus,
    isLate,
    latePenalty,
    originalRentalPrice: baseRental,
    damageCharge,
    totalAmount
  };
}

module.exports = {
  STANDARD_RENT_PER_DAY,
  SAREE_RENT_PER_ORDER,
  LATE_RETURN_PENALTY,
  DEFAULT_RETURN_TIME,
  computeReturnDeadline,
  calculateReturnStatusAndFees
};
