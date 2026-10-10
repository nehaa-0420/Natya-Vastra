import { createPaymentOrder, failPayment, verifyPayment } from '../api.js';

// Load Razorpay's checkout script only when someone actually pays.
function loadCheckout() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load the payment window. Please check your internet connection.'));
    document.body.appendChild(script);
  });
}

/**
 * Collect the deposit for a booking.
 * Resolves with the updated booking once the payment is verified by the server.
 * Rejects with an Error whose message is safe to show to the customer.
 */
export async function payDeposit(bookingId) {
  const order = await createPaymentOrder(bookingId);
  await loadCheckout();

  return new Promise((resolve, reject) => {
    let finished = false;
    const rzp = new window.Razorpay({
      key: order.keyId,
      amount: order.amountPaise,
      currency: order.currency,
      order_id: order.orderId,
      name: 'Natya Vastra',
      description: `Deposit for booking #${order.bookingId}`,
      prefill: { name: order.customerName, email: order.customerEmail, contact: order.customerPhone },
      theme: { color: '#6B1428' },
      handler: async (response) => {
        finished = true;
        try {
          resolve(await verifyPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature
          }));
        } catch (err) {
          reject(err);
        }
      },
      modal: {
        ondismiss: async () => {
          if (finished) return;
          finished = true;
          try { await failPayment(order.orderId); } catch { /* the booking is still safe */ }
          reject(new Error('Payment was not completed. You can try again, or message us on WhatsApp.'));
        }
      }
    });
    rzp.open();
  });
}
