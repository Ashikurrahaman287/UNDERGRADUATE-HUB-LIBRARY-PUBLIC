import Image from "next/image";

type Testimonial = {
  name: string;
  university: string;
  rating: 4 | 5;
  review: string;
  avatar: string;
};

const testimonialAvatars = [
  "https://znhaqyuhxydnjijbkzza.supabase.co/storage/v1/object/public/book-covers/82b3310906d16d0b646762dfdc1a0ace.jpg",
  "https://znhaqyuhxydnjijbkzza.supabase.co/storage/v1/object/public/book-covers/il_570xN.935622988_rj7q.webp",
  "https://znhaqyuhxydnjijbkzza.supabase.co/storage/v1/object/public/book-covers/il_570xN.935622988_rj7q.webp",
  "https://znhaqyuhxydnjijbkzza.supabase.co/storage/v1/object/public/book-covers/images%20(2).jfif",
  "https://znhaqyuhxydnjijbkzza.supabase.co/storage/v1/object/public/book-covers/images%20(3).jfif",
  "https://znhaqyuhxydnjijbkzza.supabase.co/storage/v1/object/public/book-covers/images%20(4).jfif",
] as const;

const testimonials: Testimonial[] = [
  {
    name: "Mehreen Mehzabin",
    university: "East West University - EWU",
    rating: 5,
    review: "honestly such a lifesaver for EWU students. I placed the order on my phone during lecture and picked it up right at the EWU pickup point after class ended. book condition was 10/10 pristine 🤍",
    avatar: testimonialAvatars[3],
  },
  {
    name: "Nabila Binte Hasan",
    university: "East West University - EWU",
    rating: 4,
    review: "super smooth service! only giving 4 stars because i showed up 10 mins early for pickup before my slot haha but the team was nice enough to hand me my book anyway. love supporting student initiatives!",
    avatar: testimonialAvatars[0],
  },
  {
    name: "Tanvir Chowdhury",
    university: "East West University - EWU",
    rating: 5,
    review: "The web catalog is surprisingly fast and easy to browse. Placed my order last night, got the pickup notification this morning, and picked it up near EWU. smooth experience zero hassle.",
    avatar: testimonialAvatars[5],
  },
  {
    name: "Samiul Islam",
    university: "East West University - EWU",
    rating: 5,
    review: "As an EWU student, having the pickup location right at campus gate saves so much time and delivery fee. picked up 'Atomic Habits' and a sci-fi novel. keep up the great work guys!!",
    avatar: testimonialAvatars[2],
  },
  {
    name: "Farhana Akter",
    university: "East West University - EWU",
    rating: 4,
    review: "Website catalog is updated regularly which is cool. I had a slight typo in my phone number while ordering online but messaged their Facebook page and they fixed it instantly. Pickup at EWU was super fast.",
    avatar: testimonialAvatars[4],
  },
  {
    name: "Nusrat Jahan Aurni",
    university: "BRAC University",
    rating: 5,
    review: "Since I live in Aftabnagar near EWU, selecting the EWU pickup point on the site was super handy for me. Ordered two novels on their website and picked them up without any delay!",
    avatar: testimonialAvatars[1],
  },
  {
    name: "Tanvir Ahmed",
    university: "North South University - NSU",
    rating: 5,
    review: "ordered online while stuck in jam and chose delivery. book arrived packed really well. really cool web interface for browsing categories like psychology and fiction!",
    avatar: testimonialAvatars[0],
  },
  {
    name: "Fariha Rahman",
    university: "Bangladesh University of Professionals - BUP",
    rating: 4,
    review: "forgot my account login password on their website for a sec lol but support reset it super fast. website layout is really clean and book recommendations are spot on!",
    avatar: testimonialAvatars[4],
  },
  {
    name: "Kazi Shahriar Islam",
    university: "American International University-Bangladesh - AIUB",
    rating: 5,
    review: "Its hard to find good independent book hubs that carry solid non-fiction. Ordered online and picked it up near EWU on my way home. Great initiative.",
    avatar: testimonialAvatars[3],
  },
  {
    name: "Shahrear Kabir",
    university: "BRAC University",
    rating: 4,
    review: "Overall great experience! Web ordering was easy, though I wish there were even more fiction titles added. Pickup near EWU was quick and easy.",
    avatar: testimonialAvatars[2],
  },
  {
    name: "Asif Mahmud",
    university: "Bangladesh University of Professionals - BUP",
    rating: 5,
    review: "Ordered online, got confirmation msg, and picked it up. Books were in pristine condition. No nonsense, 5 stars!",
    avatar: testimonialAvatars[1],
  },
  {
    name: "Rokon Uz Zaman",
    university: "AIUB",
    rating: 5,
    review: "website is super easy to use on phone. ordered a book yesterday and collected it today near EWU without any hassle. highly recommend to any student looking for good reads!",
    avatar: testimonialAvatars[5],
  },
];

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  return (
    <article className="testimonial-card">
      <Image alt={`${testimonial.name}'s profile avatar`} className="testimonial-avatar" height={48} src={testimonial.avatar} width={48} />
      <div className="testimonial-card-content">
        <div aria-label={`${testimonial.rating} out of 5 stars`} className="testimonial-stars" role="img">
          {Array.from({ length: 5 }, (_, index) => <span aria-hidden="true" className={index < testimonial.rating ? "testimonial-star-filled" : "testimonial-star-empty"} key={index}>{index < testimonial.rating ? "★" : "☆"}</span>)}
        </div>
        <p className="testimonial-review">“{testimonial.review}”</p>
        <div className="testimonial-profile"><strong>{testimonial.name}</strong><span>{testimonial.university}</span></div>
      </div>
    </article>
  );
}

export function Testimonials() {
  return (
    <section aria-labelledby="testimonials-title" className="home-testimonials">
      <div className="container home-testimonials-heading">
        <p className="eyebrow">Student stories</p>
        <h2 className="display-font" id="testimonials-title">Readers say it best.</h2>
      </div>
      <div aria-label="Student testimonials" className="home-testimonials-viewport" role="region" tabIndex={0}>
        <div className="home-testimonials-track">
          {[false, true].map((duplicate) => <div aria-hidden={duplicate} className="home-testimonials-set" key={duplicate ? "duplicate" : "original"}>
            {testimonials.map((testimonial) => <TestimonialCard key={testimonial.name} testimonial={testimonial} />)}
          </div>)}
        </div>
      </div>
    </section>
  );
}