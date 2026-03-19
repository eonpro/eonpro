import { products } from '@/app/wellmedr-checkout/data/products';
import FAQItem from '../FAQItem';

export default function FAQ() {
  return (
    <div className="flex flex-col gap-8">
      <h3 className="mb-0 text-center">Frequently Asked Questions</h3>

      <div className="flex flex-col gap-4">
        <FAQItem
          question="What is the Wellmedr Prescription Plan?"
          answer="The Wellmedr Prescription Plan is a weight loss plan that includes personalized care PLUS medical support and access to weight loss medications through a written prescription."
        />
        <FAQItem
          question="What is the cost of medication?"
          answer={`If you choose to purchase the medication through Wellmedr via self-pay (no insurance) the cost for your Semaglutide prescription is as low as $${products['semaglutide'].pricing.injections.monthlyPrice} per month and the cost for your tirzepatide prescription is as low as $${products['tirzepatide'].pricing.injections.monthlyPrice} per month. Refill price is locked in at the same price ongoing, regardless of the dosage.`}
        />
        <FAQItem
          question="Is it difficult to take the meds/what if I don’t know how to do the injections?"
          answer="If you choose tablets, you simply place between your gums and cheek and they dissolve. For injections, it is simple Injections just take a few seconds and become second nature within weeks."
        />
      </div>
    </div>
  );
}
