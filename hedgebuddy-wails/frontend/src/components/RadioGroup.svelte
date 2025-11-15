<script lang="ts">
  export let options: { value: string; label: string }[];
  export let value: string;
  export let name: string;
</script>

<div class="radio-group">
  {#each options as option}
    <label class="radio-label">
      <input 
        type="radio" 
        {name}
        value={option.value}
        bind:group={value}
      />
      <span>{option.label}</span>
    </label>
  {/each}
</div>

<style>
  .radio-group {
    display: flex;
    gap: var(--spacing-lg);
    flex-wrap: wrap;
  }
  
  .radio-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: pointer;
    color: var(--text-secondary);
    text-transform: none;
    font-size: var(--text-md);
    margin: 0;
  }
  
  .radio-label input[type="radio"] {
    width: 20px;
    height: 20px;
    accent-color: var(--accent-blue);
    cursor: pointer;
  }
</style>
