# Event Topics for PulseWard Hospital Management System

This document outlines the event topics used within the PulseWard Hospital Management System. These topics facilitate communication between various services and applications, enabling an event-driven architecture that enhances the system's responsiveness and scalability.

## Event Topics

### Patient Events

- **patient.created**: Triggered when a new patient is registered in the system.
- **patient.updated**: Triggered when a patient's information is updated.
- **patient.deleted**: Triggered when a patient is removed from the system.

### Appointment Events

- **appointment.scheduled**: Triggered when a new appointment is scheduled.
- **appointment.rescheduled**: Triggered when an existing appointment is rescheduled.
- **appointment.cancelled**: Triggered when an appointment is cancelled.

### Billing Events

- **billing.invoice.created**: Triggered when a new invoice is generated for a patient.
- **billing.payment.received**: Triggered when a payment is received for an invoice.
- **billing.invoice.updated**: Triggered when an invoice is updated.

### Pharmacy Events

- **pharmacy.prescription.created**: Triggered when a new prescription is created.
- **pharmacy.prescription.filled**: Triggered when a prescription is filled.
- **pharmacy.prescription.cancelled**: Triggered when a prescription is cancelled.

### Lab Events

- **lab.test.requested**: Triggered when a new lab test is requested.
- **lab.test.completed**: Triggered when a lab test is completed.
- **lab.test.result.published**: Triggered when the results of a lab test are published.

### Notification Events

- **notification.sent**: Triggered when a notification is sent to a patient or clinician.
- **notification.failed**: Triggered when a notification fails to send.

## Conclusion

These event topics are essential for maintaining a robust and efficient communication system within the PulseWard Hospital Management System. They ensure that all relevant parties are informed of significant changes and actions, thereby improving the overall management of hospital operations.
