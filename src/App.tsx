import NavigationBar from './components/NavigationBar';
import VideoBackground from './components/VideoBackground';
import HeroSection from './components/HeroSection';

function App() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-white">
      <VideoBackground />
      <NavigationBar />
      <HeroSection />
    </div>
  );
}

export default App;

