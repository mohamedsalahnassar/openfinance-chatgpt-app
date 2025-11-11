<template>
  <div class="progress-bar-container">
    <div class="progress-bar-line"></div>
    <div class="progress-group">
      <div :class="progressCircle('consent')">
        <div class="progress-number">
          <span v-if="consentStage">1</span>
          <img v-else class="tick-icon" src="../assets/icons/tick.svg" alt="tick" />
        </div>
      </div>
      <div class="progress-section-heading">
        Consent
      </div>
    </div>
    <div class="progress-group">
      <div :class="progressCircle('authorize')">
        <div class="progress-number">
          <span v-if="consentStage">2</span>
          <img v-else class="tick-icon" src="../assets/icons/tick.svg" alt="tick" />
        </div>
      </div>
      <div class="progress-section-heading">
        Authorize
      </div>
    </div>
    <div class="progress-group">
      <div :class="progressCircle('complete')">
        <div class="progress-number">
          <span v-if="consentStage">3</span>
          <img v-else class="tick-icon" src="../assets/icons/tick.svg" alt="tick" />
        </div>
      </div>
      <div class="progress-section-heading">
        Complete
      </div>
    </div>
  </div>
</template>

<script>
// import { useRoute } from 'vue-router'

export default {
  computed: {
    route() {
      return this.$route.name
    },
    consentStage() {
      if(this.route === 'consent-setup' || this.route === 'sip-permissions' || this.route === 'vrp-permissions' || this.route === 'data-permissions') {
        return true
      }
      return false
    },
  },
  methods: {
    progressCircle(val) {
      if (val === 'consent') {
        return 'progress-circle-active'
      }
      else if (val = 'authorize' && (this.route === 'callback')) {
        return 'progress-circle-active'
      }
      else if (val = 'complete' && (this.route === 'data-requests' || this.route === 'vrp-requests'  || this.route === 'sip-request'   || this.route === 'vrp-success' || this.route === 'sip-success'   || this.route === 'data-success')) {
        return 'progress-circle-active'
      }
      else {
        return 'progress-circle'
      }
    }
  }
}

</script>