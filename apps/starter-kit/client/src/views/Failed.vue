<template>
  <div class="text-section">
    <h1 class="text-section-title" style="text-align: center;">
      Error
    </h1>
    <div class="cross-container">
      <img class="cross" src="../assets/icons/cross.svg" alt="tick" />
    </div>
    <p style="text-align: center;">
      Unfortunately something went wrong with your authorization, click below to try again.
    </p>
  </div>
  <div>
    <button @click="submit" class="secondaryButton">
      <span class="seondary-button-text">Back to Consent Setup</span>
    </button>
  </div>
</template>

<script>
export default {
  methods: {
    submit() {
      this.$router.push({name: 'consent-setup'})
    }
  }
}
</script>