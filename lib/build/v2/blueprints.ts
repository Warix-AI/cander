import type { V2BlueprintRecord, V2BlueprintDefinition } from "./types.ts";

function pages(
  defs: V2BlueprintDefinition["pages"],
): V2BlueprintDefinition {
  return { pages: defs };
}

/** Six starter blueprints — 3 categories × 2 designs. Stored in DB via seed. */
export const STARTER_BLUEPRINTS: V2BlueprintRecord[] = [
  {
    id: "service_classic",
    name: "Service Classic",
    categoryId: "local_service",
    description: "Trusted local service site with clear offers and contact.",
    status: "active",
    version: 1,
    themePresetId: "clean_minimal",
    behaviorPresetId: "subtle_motion",
    headerVariantId: "header_simple",
    footerVariantId: "footer_simple",
    sortOrder: 10,
    definition: pages([
      {
        id: "home",
        path: "/",
        title: "Home",
        sections: [
          {
            id: "home_hero",
            componentType: "hero",
            variantId: "hero_centered",
            content: {
              eyebrow: "Local experts",
              headline: "Reliable service you can trust",
              supporting_text: "Quality workmanship for homes and businesses nearby.",
              primary_cta_label: "Get a quote",
              primary_cta_url: "/contact",
            },
          },
          {
            id: "home_features",
            componentType: "features",
            variantId: "features_grid_3",
            content: {
              headline: "What we do",
              items: JSON.stringify([
                { title: "Assessment", body: "Clear recommendations before we start." },
                { title: "Quality work", body: "Careful execution with tidy finish." },
                { title: "Follow-through", body: "We stand behind every job." },
              ]),
            },
          },
          {
            id: "home_cta",
            componentType: "cta",
            variantId: "cta_band",
            content: {
              headline: "Ready to get started?",
              body: "Tell us what you need — we’ll respond quickly.",
              primary_cta_label: "Contact us",
              primary_cta_url: "/contact",
            },
          },
        ],
      },
      {
        id: "services",
        path: "/services",
        title: "Services",
        sections: [
          {
            id: "svc_list",
            componentType: "features",
            variantId: "features_list",
            content: {
              headline: "Services",
              items: JSON.stringify([
                { title: "Core service", body: "Our primary offering for local customers." },
                { title: "Maintenance", body: "Ongoing care and seasonal checkups." },
              ]),
            },
          },
        ],
      },
      {
        id: "about",
        path: "/about",
        title: "About",
        sections: [
          {
            id: "about_split",
            componentType: "image_text",
            variantId: "image_text_left",
            content: {
              headline: "About us",
              body: "A local team focused on clear communication and solid results.",
            },
          },
        ],
      },
      {
        id: "contact",
        path: "/contact",
        title: "Contact",
        sections: [
          {
            id: "contact_main",
            componentType: "contact",
            variantId: "contact_split",
            content: {
              headline: "Contact",
              body: "Call, email, or send a message.",
              form_cta_label: "Send message",
            },
          },
        ],
      },
    ]),
  },
  {
    id: "service_modern",
    name: "Service Modern",
    categoryId: "local_service",
    description: "Modern local service site with social proof and process.",
    status: "active",
    version: 1,
    themePresetId: "bold_modern",
    behaviorPresetId: "expressive_motion",
    headerVariantId: "header_cta",
    footerVariantId: "footer_minimal",
    sortOrder: 11,
    definition: pages([
      {
        id: "home",
        path: "/",
        title: "Home",
        sections: [
          {
            id: "home_hero",
            componentType: "hero",
            variantId: "hero_split",
            content: {
              eyebrow: "Book online",
              headline: "Modern service, done right",
              supporting_text: "Fast scheduling and transparent pricing.",
              primary_cta_label: "Book now",
              primary_cta_url: "/contact",
            },
          },
          {
            id: "home_stats",
            componentType: "stats",
            variantId: "stats_row",
            content: {
              items: JSON.stringify([
                { value: "500+", label: "Jobs completed" },
                { value: "4.9★", label: "Average rating" },
                { value: "24h", label: "Typical response" },
              ]),
            },
          },
          {
            id: "home_process",
            componentType: "process",
            variantId: "process_steps",
            content: {
              headline: "How it works",
              items: JSON.stringify([
                { title: "Request", body: "Tell us what you need." },
                { title: "Quote", body: "Get a clear estimate." },
                { title: "Done", body: "We complete the work on schedule." },
              ]),
            },
          },
          {
            id: "home_reviews",
            componentType: "testimonials",
            variantId: "testimonials_cards",
            content: {
              headline: "Reviews",
              items: JSON.stringify([
                { quote: "Showed up on time and did excellent work.", name: "Alex", role: "Homeowner" },
                { quote: "Clear pricing and great communication.", name: "Sam", role: "Business owner" },
              ]),
            },
          },
        ],
      },
      {
        id: "services",
        path: "/services",
        title: "Services",
        sections: [
          {
            id: "svc_pricing",
            componentType: "pricing_list",
            variantId: "pricing_list",
            content: {
              headline: "Packages",
              items: JSON.stringify([
                { name: "Essential", price: "From $149", detail: "Core service visit." },
                { name: "Complete", price: "From $299", detail: "Full assessment + work." },
              ]),
            },
          },
        ],
      },
      {
        id: "reviews",
        path: "/reviews",
        title: "Reviews",
        sections: [
          {
            id: "reviews_main",
            componentType: "testimonials",
            variantId: "testimonials_single",
            content: {
              quote: "The most professional local crew we’ve hired.",
              name: "Jordan",
              role: "Property manager",
            },
          },
        ],
      },
      {
        id: "about",
        path: "/about",
        title: "About",
        sections: [
          {
            id: "about_body",
            componentType: "image_text",
            variantId: "image_text_left",
            content: { headline: "Our story", body: "Built for modern households that want less hassle." },
          },
        ],
      },
      {
        id: "contact",
        path: "/contact",
        title: "Contact",
        sections: [
          {
            id: "contact_form",
            componentType: "form",
            variantId: "form_simple",
            content: { headline: "Request a visit", submit_label: "Submit" },
          },
        ],
      },
    ]),
  },
  {
    id: "restaurant_classic",
    name: "Restaurant Classic",
    categoryId: "restaurant",
    description: "Warm hospitality site with menu and contact.",
    status: "active",
    version: 1,
    themePresetId: "warm_editorial",
    behaviorPresetId: "subtle_motion",
    headerVariantId: "header_centered",
    footerVariantId: "footer_columns",
    sortOrder: 20,
    definition: {
      ...pages([
        {
          id: "home",
          path: "/",
          title: "Home",
          sections: [
            {
              id: "home_hero",
              componentType: "hero",
              variantId: "hero_editorial",
              content: {
                eyebrow: "Reservations welcome",
                headline: "An evening at the table",
                supporting_text: "Seasonal cooking in a warm, welcoming room.",
                primary_cta_label: "View menu",
                primary_cta_url: "/menu",
              },
            },
            {
              id: "home_about",
              componentType: "image_text",
              variantId: "image_text_left",
              content: {
                headline: "Our kitchen",
                body: "Handmade dishes with local ingredients.",
                cta_label: "About us",
                cta_url: "/about",
              },
            },
            {
              id: "home_hours",
              componentType: "hours_location",
              variantId: "hours_location",
              content: { headline: "Visit us", hours: "Tue–Sun 5–10pm" },
            },
          ],
        },
        {
          id: "menu",
          path: "/menu",
          title: "Menu",
          sections: [
            {
              id: "menu_main",
              componentType: "menu_list",
              variantId: "menu_list",
              content: {
                headline: "Menu",
                groups: JSON.stringify([
                  {
                    title: "Starters",
                    items: [{ name: "House salad", price: "$12", desc: "Seasonal greens." }],
                  },
                  {
                    title: "Mains",
                    items: [{ name: "Chef’s pasta", price: "$24", desc: "Handmade daily." }],
                  },
                ]),
              },
            },
          ],
        },
        {
          id: "about",
          path: "/about",
          title: "About",
          sections: [
            {
              id: "about_story",
              componentType: "image_text",
              variantId: "image_text_left",
              content: { headline: "Our story", body: "A neighborhood restaurant built around hospitality." },
            },
          ],
        },
        {
          id: "contact",
          path: "/contact",
          title: "Contact",
          sections: [
            {
              id: "contact_main",
              componentType: "contact",
              variantId: "contact_split",
              content: {
                headline: "Reservations & contact",
                form_cta_label: "Send a note",
              },
            },
          ],
        },
      ]),
      requiredBrandFields: ["address", "hours", "phone"],
    },
  },
  {
    id: "restaurant_modern",
    name: "Restaurant Modern",
    categoryId: "restaurant",
    description: "Modern restaurant with gallery and reservations focus.",
    status: "active",
    version: 1,
    themePresetId: "bold_modern",
    behaviorPresetId: "expressive_motion",
    headerVariantId: "header_cta",
    footerVariantId: "footer_minimal",
    sortOrder: 21,
    definition: {
      ...pages([
        {
          id: "home",
          path: "/",
          title: "Home",
          sections: [
            {
              id: "home_hero",
              componentType: "hero",
              variantId: "hero_split",
              content: {
                eyebrow: "Book a table",
                headline: "Dining, elevated",
                supporting_text: "A contemporary room for celebrations and weeknights alike.",
                primary_cta_label: "Reserve",
                primary_cta_url: "/reservations",
              },
            },
            {
              id: "home_gallery",
              componentType: "gallery",
              variantId: "gallery_grid",
              content: { headline: "Atmosphere", images: JSON.stringify([]) },
            },
            {
              id: "home_cta",
              componentType: "cta",
              variantId: "cta_band",
              content: {
                headline: "Join us tonight",
                primary_cta_label: "Make a reservation",
                primary_cta_url: "/reservations",
              },
            },
          ],
        },
        {
          id: "menu",
          path: "/menu",
          title: "Menu",
          sections: [
            {
              id: "menu_main",
              componentType: "menu_list",
              variantId: "menu_list",
              content: {
                headline: "Seasonal menu",
                groups: JSON.stringify([
                  { title: "Plates", items: [{ name: "Signature dish", price: "$32", desc: "" }] },
                ]),
              },
            },
          ],
        },
        {
          id: "reservations",
          path: "/reservations",
          title: "Reservations",
          sections: [
            {
              id: "res_form",
              componentType: "form",
              variantId: "form_simple",
              content: { headline: "Request a table", submit_label: "Request" },
            },
            {
              id: "res_hours",
              componentType: "hours_location",
              variantId: "hours_location",
              content: { headline: "Hours & location" },
            },
          ],
        },
        {
          id: "gallery",
          path: "/gallery",
          title: "Gallery",
          sections: [
            {
              id: "gal_main",
              componentType: "gallery",
              variantId: "gallery_grid",
              content: { headline: "Gallery", images: JSON.stringify([]) },
            },
          ],
        },
        {
          id: "contact",
          path: "/contact",
          title: "Contact",
          sections: [
            {
              id: "contact_main",
              componentType: "contact",
              variantId: "contact_split",
              content: { headline: "Contact", form_cta_label: "Send" },
            },
          ],
        },
      ]),
      requiredBrandFields: ["address", "hours", "phone"],
    },
  },
  {
    id: "professional_classic",
    name: "Professional Classic",
    categoryId: "professional",
    description: "Clean professional services site.",
    status: "active",
    version: 1,
    themePresetId: "clean_minimal",
    behaviorPresetId: "minimal_motion",
    headerVariantId: "header_simple",
    footerVariantId: "footer_simple",
    sortOrder: 30,
    definition: pages([
      {
        id: "home",
        path: "/",
        title: "Home",
        sections: [
          {
            id: "home_hero",
            componentType: "hero",
            variantId: "hero_centered",
            content: {
              eyebrow: "Consulting",
              headline: "Clarity for growing teams",
              supporting_text: "Practical guidance grounded in your business.",
              primary_cta_label: "Book a consult",
              primary_cta_url: "/contact",
            },
          },
          {
            id: "home_services",
            componentType: "features",
            variantId: "features_grid_3",
            content: {
              headline: "Services",
              items: JSON.stringify([
                { title: "Strategy", body: "Focused plans you can execute." },
                { title: "Operations", body: "Systems that reduce friction." },
                { title: "Advisory", body: "Ongoing counsel for key decisions." },
              ]),
            },
          },
          {
            id: "home_proof",
            componentType: "testimonials",
            variantId: "testimonials_cards",
            content: {
              headline: "Clients",
              items: JSON.stringify([
                { quote: "Helped us prioritize with confidence.", name: "Taylor", role: "Founder" },
              ]),
            },
          },
        ],
      },
      {
        id: "services",
        path: "/services",
        title: "Services",
        sections: [
          {
            id: "svc_main",
            componentType: "features",
            variantId: "features_list",
            content: {
              headline: "How we help",
              items: JSON.stringify([
                { title: "Engagement", body: "Scoped projects with clear outcomes." },
              ]),
            },
          },
        ],
      },
      {
        id: "about",
        path: "/about",
        title: "About",
        sections: [
          {
            id: "about_main",
            componentType: "image_text",
            variantId: "image_text_left",
            content: { headline: "About", body: "Experienced operators turned advisors." },
          },
        ],
      },
      {
        id: "contact",
        path: "/contact",
        title: "Contact",
        sections: [
          {
            id: "contact_main",
            componentType: "contact",
            variantId: "contact_split",
            content: { headline: "Let’s talk", form_cta_label: "Request a call" },
          },
        ],
      },
    ]),
  },
  {
    id: "professional_modern",
    name: "Professional Modern",
    categoryId: "professional",
    description: "Modern creative/professional site with work highlights.",
    status: "active",
    version: 1,
    themePresetId: "warm_editorial",
    behaviorPresetId: "subtle_motion",
    headerVariantId: "header_centered",
    footerVariantId: "footer_columns",
    sortOrder: 31,
    definition: pages([
      {
        id: "home",
        path: "/",
        title: "Home",
        sections: [
          {
            id: "home_hero",
            componentType: "hero",
            variantId: "hero_editorial",
            content: {
              eyebrow: "Studio",
              headline: "Work that earns attention",
              supporting_text: "Design and strategy for ambitious brands.",
              primary_cta_label: "See work",
              primary_cta_url: "/work",
            },
          },
          {
            id: "home_process",
            componentType: "process",
            variantId: "process_steps",
            content: {
              headline: "Process",
              items: JSON.stringify([
                { title: "Discover", body: "Understand goals and constraints." },
                { title: "Craft", body: "Shape the work with intention." },
                { title: "Launch", body: "Ship, measure, refine." },
              ]),
            },
          },
          {
            id: "home_faq",
            componentType: "faq",
            variantId: "faq_accordion",
            content: {
              headline: "FAQ",
              items: JSON.stringify([
                { q: "How do engagements start?", a: "With a short discovery call." },
              ]),
            },
          },
        ],
      },
      {
        id: "work",
        path: "/work",
        title: "Work",
        sections: [
          {
            id: "work_gallery",
            componentType: "gallery",
            variantId: "gallery_grid",
            content: { headline: "Selected work", images: JSON.stringify([]) },
          },
        ],
      },
      {
        id: "services",
        path: "/services",
        title: "Services",
        sections: [
          {
            id: "svc_main",
            componentType: "pricing_list",
            variantId: "pricing_list",
            content: {
              headline: "Engagements",
              items: JSON.stringify([
                { name: "Sprint", price: "Fixed", detail: "2–4 week focused project." },
                { name: "Retainer", price: "Monthly", detail: "Ongoing creative partnership." },
              ]),
            },
          },
        ],
      },
      {
        id: "about",
        path: "/about",
        title: "About",
        sections: [
          {
            id: "about_main",
            componentType: "image_text",
            variantId: "image_text_left",
            content: { headline: "About the studio", body: "A small team with a sharp point of view." },
          },
        ],
      },
      {
        id: "contact",
        path: "/contact",
        title: "Contact",
        sections: [
          {
            id: "contact_main",
            componentType: "form",
            variantId: "form_simple",
            content: { headline: "Start a project", submit_label: "Send inquiry" },
          },
        ],
      },
    ]),
  },
];

export const STARTER_CATEGORIES = [
  {
    id: "local_service",
    name: "Local Service Business",
    description: "Trades, home services, local operators.",
    sort_order: 1,
  },
  {
    id: "restaurant",
    name: "Restaurant / Hospitality",
    description: "Restaurants, cafes, hospitality venues.",
    sort_order: 2,
  },
  {
    id: "professional",
    name: "Professional / Creative Business",
    description: "Consultants, studios, professional services.",
    sort_order: 3,
  },
] as const;
