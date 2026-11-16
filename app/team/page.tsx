import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

const teamMembers = [
  {
    name: "SPUDBLOCKS",
    role: "Technology Partner",
    image: "https://pbs.twimg.com/profile_images/1741169306996768768/XDT1aDAb_400x400.jpg",
  },
  {
    name: "SAGA LAB",
    role: "Technology Partner",
    image: "https://pbs.twimg.com/profile_images/1914420826364854272/kOa86QzS_400x400.jpg",
  },
  {
    name: "AGT Venture",
    role: "Investment Partner",
    image: "https://pbs.twimg.com/profile_images/1907424447759335424/UM5hzrxL_400x400.jpg",
  },
  {
    name: "Araddha Mahjabin Jannat",
    role: "Co-Founder & Operation",
    image: "https://znhaqyuhxydnjijbkzza.supabase.co/storage/v1/object/public/book-covers/HU79xk2a0AAbvjt.jfif",
  },
  {
    name: "Ashikur Rahman",
    role: "Co-Founder & Tech",
    image: "https://znhaqyuhxydnjijbkzza.supabase.co/storage/v1/object/public/book-covers/frBjqmF5_400x400.webp",
  },
  {
    name: "Saiful Islam Rimon",
    role: "Marketing & Logistic",
    image: "https://znhaqyuhxydnjijbkzza.supabase.co/storage/v1/object/public/book-covers/Gemini_Generated_Image_o45fc3o45fc3o45f.jpg",
  },
  {
    name: "Marzia Himi",
    role: "Marketing & Content Creation",
    image: "https://znhaqyuhxydnjijbkzza.supabase.co/storage/v1/object/public/book-covers/HU7-cL4b0AAJX8b.jfif",
  },
  {
    name: "Mohammad Abeg",
    role: "Content Creation",
    image: "https://znhaqyuhxydnjijbkzza.supabase.co/storage/v1/object/public/book-covers/Gemini_Generated_Image_bct15ebct15ebct1.jfif",
  },
  {
    name: "JR Tamim",
    role: "Content Creation",
    image: "https://znhaqyuhxydnjijbkzza.supabase.co/storage/v1/object/public/book-covers/Gemini_Generated_Image_hyjliihyjliihyjl.jpg",
  },
  {
    name: "Jahidul Islam",
    role: "Logistic & Customer Support",
    image: "https://znhaqyuhxydnjijbkzza.supabase.co/storage/v1/object/public/book-covers/Gemini_Generated_Image_vt7dzrvt7dzrvt7d.jpg",
  },
];

export const metadata: Metadata = {
  title: "Our Team",
  description: "Meet the people and partners behind Undergraduate Hub Library.",
  alternates: { canonical: "/team" },
};

export default function TeamPage() {
  return (
    <main className="page-main team-page" id="main-content">
      <section className="contact-intro container">
        <p className="eyebrow">Undergraduate HUB</p>
        <h1 className="display-font">Our Team</h1>
        <p>Meet the people and partners behind Undergraduate Hub Library.</p>
      </section>
      <section aria-labelledby="team-heading" className="container team-section">
        <div className="team-heading">
          <div>
            <span className="eyebrow">People &amp; partners</span>
            <h2 className="display-font" id="team-heading">The team</h2>
          </div>
          <p>Get in touch with the library through the <Link href="/contact">Contact page</Link>.</p>
        </div>
        <div className="team-grid">
          {teamMembers.map((member, index) => (
            <article className="team-card" key={member.name}>
              <div className="team-photo">
                <Image
                  alt={member.name}
                  src={member.image}
                  width={480}
                  height={480}
                  sizes="(max-width: 700px) 100vw, 33vw"
                />
              </div>
              <div className="team-card-copy">
                <span className="team-index">{String(index + 1).padStart(2, "0")}</span>
                <h3 className="display-font">{member.name}</h3>
                <p>{member.role}</p>
                <span className="team-affiliation">Undergraduate HUB</span>
              </div>
            </article>
          ))}
        </div>
      </section>
      <div className="container contact-footer-link">
        <span>Questions for the library?</span>
        <Link className="text-link" href="/contact">Contact the library team <span aria-hidden="true">→</span></Link>
      </div>
    </main>
  );
}
