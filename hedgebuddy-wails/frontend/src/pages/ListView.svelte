<script lang="ts">
  import { FolderOpen, RefreshCw, Plus, FileDown } from 'lucide-svelte';
  import Button from '../components/Button.svelte';
  import VariableCard from '../components/VariableCard.svelte';
  import Loader from '../components/Loader.svelte';
  import logo from '../assets/images/hedgebuddy_icon.png';
  
  export let variables: Record<string, any>;
  export let sortedKeys: string[];
  export let isLoading: boolean = false;
  
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
  
  let isRefreshing = false;
  
  async function handleRefresh() {
    if (isRefreshing) return; // Prevent double-click
    
    isRefreshing = true;
    dispatch('refresh');
    
    // Keep spinning for at least 600ms even if refresh is instant
    await new Promise(resolve => setTimeout(resolve, 600));
    isRefreshing = false;
  }
</script>

<div class="header">
  <img src={logo} alt="HedgeBuddy" class="logo" />
  <div class="header-info">
    <h1>HedgeBuddy</h1>
    <p class="description">
      Manage environment variables for Hedge.co Python scripts • Click + New to add • Edit or delete existing variables
    </p>
  </div>
  <div class="header-actions">
    <Button variant="icon" title="Import from file" on:click={() => dispatch('import')}>
      <FileDown size={20} />
    </Button>
    <Button variant="icon" title="Open folder" on:click={() => dispatch('openFolder')}>
      <FolderOpen size={20} />
    </Button>
    <Button variant="icon" title="Refresh" on:click={handleRefresh}>
      <span class="refresh-icon" class:spinning={isRefreshing}>
        <RefreshCw size={20} />
      </span>
    </Button>
    <Button variant="primary" on:click={() => dispatch('add')}>
      <Plus size={18} />
      New
    </Button>
  </div>
</div>

{#if isLoading}
  <Loader message="Loading variables..." />
{:else}
  <div class="variables-list">
    {#each sortedKeys as name}
      {@const variable = variables[name]}
      <VariableCard
        {name}
        value={variable.value}
        type={variable.type}
        description={variable.description}
        on:edit={(e) => dispatch('edit', e.detail)}
        on:delete={(e) => dispatch('delete', e.detail)}
      />
    {/each}
  </div>
{/if}

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-xl);
    margin-bottom: var(--spacing-2xl);
  }
  
  .logo {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    flex-shrink: 0;
  }
  
  .header-info {
    flex: 1;
  }
  
  h1 {
    font-size: var(--text-3xl);
    color: var(--text-primary);
    margin: 0 0 var(--spacing-xs) 0;
  }
  
  .description {
    color: #8c8c96;
    font-size: var(--text-sm);
    margin: 0;
  }
  
  .header-actions {
    display: flex;
    gap: 10px;
    flex-shrink: 0;
  }
  
  .refresh-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  
  .refresh-icon.spinning {
    animation: spin 0.6s linear 1;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .variables-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }
</style>
