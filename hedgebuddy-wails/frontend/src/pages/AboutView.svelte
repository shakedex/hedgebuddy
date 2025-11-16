<script lang="ts">
  import { ArrowLeft, ExternalLink, Github } from 'lucide-svelte';
  import Button from '../components/Button.svelte';
  import logo from '../assets/images/hedgebuddy_icon.png';
  
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
  
  function openLink(url: string) {
    // Wails will handle opening external links
    window.open(url, '_blank');
  }
</script>

<div class="about-container">
  <div class="about-header">
    <Button variant="secondary" on:click={() => dispatch('back')}>
      <ArrowLeft size={18} />
      Back
    </Button>
  </div>
  
  <div class="about-content">
    <img src={logo} alt="HedgeBuddy" class="about-logo" />
    <h1>HedgeBuddy</h1>
    <p class="version">v0.5.1</p>
    
    <div class="section credits">
      <p class="credits-author">Created by <strong>Shaked Lipszyc</strong></p>
      <div class="links">
        <button class="link-button" on:click={() => openLink('https://shaked.co')}>
          <ExternalLink size={16} />
          shaked.co
        </button>
        <button class="link-button" on:click={() => openLink('https://github.com/shakedex/hedgebuddy')}>
          <Github size={16} />
          GitHub Repository
        </button>
      </div>
    </div>
    
    <div class="section">
      <h2>Built With</h2>
      <div class="frameworks">
        <span class="tech-item"><strong>Wails</strong> - Go + Web frontend framework</span>
        <span class="tech-item"><strong>Svelte</strong> - Frontend UI framework</span>
        <span class="tech-item"><strong>TypeScript</strong> - Type-safe JavaScript</span>
        <span class="tech-item"><strong>Go</strong> - Backend language</span>
        <span class="tech-item"><strong>Python</strong> - Library implementation</span>
      </div>
    </div>
    
    <div class="disclaimer">
      <h2>Disclaimer</h2>
      <p>
        HedgeBuddy is an independent, open-source project and is <strong>NOT affiliated with, 
        endorsed by, or officially associated with Hedge (hedge.co)</strong> or its parent company. 
        This software is provided "as is" without warranty of any kind.
      </p>
    </div>
    
    <p class="license">Licensed under MIT License</p>
  </div>
</div>

<style>
  .about-container {
    max-width: 600px;
    margin: 0 auto;
  }
  
  .about-header {
    margin-bottom: var(--spacing-xl);
  }
  
  .about-content {
    text-align: center;
    padding: var(--spacing-xl);
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-color);
  }
  
  .about-logo {
    width: 80px;
    height: 80px;
    border-radius: 16px;
    margin: 0 auto var(--spacing-lg);
    display: block;
  }
  
  h1 {
    font-size: var(--text-3xl);
    color: var(--text-primary);
    margin: 0 0 var(--spacing-xs) 0;
  }
  
  .version {
    color: var(--text-tertiary);
    font-size: var(--text-sm);
    margin: 0 0 var(--spacing-2xl) 0;
  }
  
  .section {
    margin-bottom: var(--spacing-2xl);
  }
  
  .section.credits {
    margin-bottom: var(--spacing-xl);
  }
  
  h2 {
    font-size: var(--text-lg);
    color: var(--text-primary);
    margin: 0 0 var(--spacing-md) 0;
  }
  
  .credits-author {
    color: var(--text-secondary);
    margin: 0 0 var(--spacing-md) 0;
    text-align: center;
  }
  
  .credits-author strong {
    color: var(--text-primary);
  }
  
  .links {
    display: flex;
    gap: var(--spacing-sm);
    justify-content: center;
    flex-wrap: wrap;
  }
  
  .link-button {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--text-sm);
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }
  
  .link-button:hover {
    background: var(--bg-hover);
    border-color: var(--primary-color);
    color: var(--primary-color);
  }
  
  .frameworks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
    justify-content: center;
  }
  
  .tech-item {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }
  
  .tech-item strong {
    color: var(--text-primary);
  }
  
  .disclaimer {
    background: rgba(255, 193, 7, 0.1);
    border: 1px solid rgba(255, 193, 7, 0.3);
    border-radius: var(--radius-md);
    padding: var(--spacing-lg);
    margin-bottom: var(--spacing-xl);
  }
  
  .disclaimer h2 {
    color: #ffc107;
    margin-bottom: var(--spacing-sm);
  }
  
  .disclaimer p {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.6;
    margin: 0;
  }
  
  .license {
    color: var(--text-tertiary);
    font-size: var(--text-xs);
    margin: 0;
    text-align: center;
  }
</style>
