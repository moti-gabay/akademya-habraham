// Contact details for "Need help?". Both are optional.
export function getHelpContacts() {
  const phone = process.env.NEXT_PUBLIC_HELP_PHONE || null;
  const whatsapp = process.env.NEXT_PUBLIC_HELP_WHATSAPP || null;
  return {
    phone,
    phoneHref: phone && `tel:${phone.replace(/[^\d+]/g, "")}`,
    whatsappHref: whatsapp && `https://wa.me/${whatsapp.replace(/\D/g, "")}`,
  };
}
