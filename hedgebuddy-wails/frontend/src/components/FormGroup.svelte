<script lang="ts">
  export let label: string;
  export let hint: string = '';
</script>

<div class="form-group">
  <span class="label">{label}</span>
  <slot />
  {#if hint}
    <p class="hint">{hint}</p>
  {/if}
</div>

<style>
  .form-group {
    background: var(--bg-secondary);
    padding: var(--spacing-xl);
    border-radius: var(--radius-md);
  }
  
  .label {
    display: block;
    color: var(--text-tertiary);
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: var(--spacing-sm);
  }
  
  .hint {
    color: var(--text-muted);
    font-size: var(--text-xs);
    margin: var(--spacing-sm) 0 0 0;
  }
</style>
