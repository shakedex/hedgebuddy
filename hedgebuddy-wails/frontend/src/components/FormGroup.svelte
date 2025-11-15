<script lang="ts">
  export let label: string;
  export let hint: string = '';
</script>

<div class="form-group">
  <label>{label}</label>
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
  
  .hint {
    color: var(--text-muted);
    font-size: var(--text-xs);
    margin: var(--spacing-sm) 0 0 0;
  }
</style>
