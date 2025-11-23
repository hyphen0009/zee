import { MusicRoom } from "@/components/MusicRoom";

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Main content */}
      <div className="flex-1">
        <MusicRoom />
      </div>

      {/* Footer */}
      <footer className="border-t py-3 text-center text-xs text-muted-foreground">
        <p>
          Created by <span className="font-semibold">The Zaix</span>
          {" · "}
          <a
            href="https://your-contact-link.com"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Contact me
          </a>
        </p>
      </footer>
    </div>
  );
};

export default Index;
